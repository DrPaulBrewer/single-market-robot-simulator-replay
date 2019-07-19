module.exports = {};

const defaultExtractor = {
  t: (event)=>(+event.t),
  period: (event)=>(+event.period),
  id: (event)=>(+(event.id || event.buyerAgentId))
};

module.exports.defaultExtractor = defaultExtractor;

function defaultInitPeriod(sim, extract=defaultExtractor){
  return function(){
    const firstEvent = sim.getReplayEvent();
    if (!firstEvent)
      throw new Error("replay defaultInitPeriod undefined event");
    if (extract.period(firstEvent)>sim.period){
      sim.period = extract.period(firstEvent);
    }
    const firstRow = sim.row;
    let lastEvent = null;
    do {
      sim.row++;
      lastEvent = sim.getReplayEvent();
    } while (lastEvent && (extract.period(lastEvent)===sim.period));
    sim.row--;
    lastEvent = sim.getReplayEvent();
    sim.row = firstRow;
    const firstTime = extract.t(firstEvent);
    const lastTime =  extract.t(lastEvent);
    const duration = +sim.config.periodDuration;
    const consistentWithEqualDuration = (
      (duration>0) &&
      (Math.floor(firstTime/duration)===sim.period) &&
      (Math.floor(lastTime/duration)===sim.period)
    );
    let newPeriod;
    if (consistentWithEqualDuration){
      newPeriod = sim.period;
    } else {
      newPeriod = {
        number: sim.period,
        startTime: Math.floor(firstTime), // ineffective because logging is based on equalDuration
        endTime: Math.ceil(lastTime),
        equalDuration: false,
        init:{inventory:{X:0, money:0}}
      };
      // force endTime and duration 1 second if zero duration
      if (newPeriod.startTime===newPeriod.endTime) newPeriod.endTime+=1;
      newPeriod.duration = newPeriod.endTime-newPeriod.startTime;
    }
    sim.pool.agents.forEach((a)=>{a.initPeriod(newPeriod);});
  };
}

module.exports.defaultInitPeriod = defaultInitPeriod;

function defaultNext(sim, extract=defaultExtractor){
  return function(){
    // this = pool
    if (this.nextCache) return this.nextCache;
    const event = sim.getReplayEvent();
    if (
      (!event) ||
      (extract.period(event)>sim.period)
    ) return 0;
    const nextId = extract.id(event);
    const nextTime = extract.t(event);
    const a = this.agentsById[nextId];
    if (
      (Number.isNaN(nextId)) ||
      (Number.isNaN(nextTime)) ||
      (a===undefined)
      ){
         throw new Error("replay terminated prematurely -- bad event: "+JSON.stringify(event));
    }
    a.wakeTime = nextTime;
    this.nextCache = a;
    return this.nextCache;
  };
}

module.exports.defaultNext = defaultNext;

const defaultReplayer = {
  orderLog(sim){
    return {
      initPeriod: defaultInitPeriod(sim),
      next: defaultNext(sim),
      wake(){
        // this = pool
        const event = sim.getReplayEvent();
        const { t, id, buyLimitPrice, sellLimitPrice } = event;
        if (+id > 0) {
          const agent = sim.pool.agentsById[+id];
          agent.wakeTime = +t;
          if (+buyLimitPrice > 0) {
            agent.marketXBid(+buyLimitPrice);
          } else if (+sellLimitPrice > 0) {
            agent.marketXAsk(+sellLimitPrice);
          }
        }
        sim.row++;
        delete this.nextCache;
      }
    };
  },
  tradeLog(sim){
    return {
      initPeriod: defaultInitPeriod(sim),
      next: defaultNext(sim),
      wake(){
        // this = pool
        const event = sim.getReplayEvent();
        const { t, price, buyerAgentId, sellerAgentId } = event;
        const buyer =  this.agentsById[+buyerAgentId];
        const seller = this.agentsById[+sellerAgentId];
        buyer.wakeTime = +t;
        seller.wakeTime = +t;
        buyer.marketXBid(+price);
        seller.marketXAsk(+price);
        sim.row++;
        delete this.nextCache;
      }
    };
  }
};

module.exports.defaultReplayer = defaultReplayer;

function colMinMax(data, colNumber){
  let min = Infinity;
  let max = -Infinity;
  for(let i=0,l=data.length;i<l;i+=1){
      try {
        const row = data[i];
        const vstr = row[colNumber];
        if ((vstr!==undefined) && (vstr!=='')){
          const v = +vstr;
          if (!Number.isNaN(v)){
            min = (v<min)? v: min;
            max = (v>max)? v: max;
          }
        }
      } catch(e){ console.log(e); }
  }
  return [min, max];
}

module.exports.colMinMax = colMinMax;


function modifySimulator(sim,options) {
  // matches the first key ending in Log like orderLog, tradeLog, somethingLog in options
  const logKey = Object.keys(options).find((k) => (k.endsWith('Log')));
  if (logKey === undefined) {
    throw new Error("replay input log not found");
  }
  function throwRequiredResubmitMissing(){
    throw new Error("replay requires resubmit function for " + logKey);
  }
  const replayer = (
    options.replayer ||
    defaultReplayer[logKey] ||
    throwRequiredResubmitMissing()
  );
  const myLog = options[logKey];
  const myLogHeader = myLog.data[0];
  const periodCol = myLogHeader.indexOf('period');
  if (periodCol < 0) {
    throw new Error("period column not found in replay log data");
  }
  const [firstPeriod, lastPeriod] = colMinMax(myLog.data,periodCol);
  sim.period = firstPeriod - 1;
  sim.config.periods = lastPeriod;
  sim.row = 1;
  const myLogData = myLog.data;
  sim.getReplayEvent = function(){
    const eventLogValues = myLogData[sim.row];
    // read a row in an array of array CSV data representation into an object
    if (!Array.isArray(eventLogValues)) return undefined;
    if (eventLogValues.every((v)=>(!v))) return undefined;
    const event = Object.fromEntries(
      myLogHeader.map((k, j) => ([k, eventLogValues[j] || '']))
    );
    return event;
  };
  const pool = sim.pool;
  pool.agents[0].on('post-period', function(){
    // fast forward sim.row to the end of the current period
    const originalRow = sim.row;
    if (sim.period===lastPeriod) return;
    while((+myLog.data[sim.row][periodCol])===sim.period)
      sim.row+=1;
    if (sim.row>originalRow)
      sim.row -= 1;
    const skipped = sim.row - originalRow;
    if (skipped>0)
      console.log(`warning: replay skipped ${skipped} rows at end of period ${sim.period}`);
  });
  pool.agents.forEach((a)=>{
    a.marketXBid = function(price){ this.bid(sim.xMarket,price);};
    a.marketXAsk = function(price){ this.ask(sim.xMarket,price);};
  });
  const simReplayer = replayer(sim);
  ['next','wake','initPeriod'].forEach((k)=>{
    if (typeof(simReplayer[k])==='function'){
      pool[k] = simReplayer[k];
    } else {
      throw new Error(`replayer requires replayer pool.${k} function`);
    }
  });
}

module.exports.modifySimulator = modifySimulator;
