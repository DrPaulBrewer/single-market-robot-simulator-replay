/* eslint-env node, mocha */
/* eslint no-sync: "off" */
const fs = require('fs');
global.fs = fs;
require('should');
const smrsReplay = require('../index.js');
const { Simulation } = require('single-market-robot-simulator');

const topPath = process.cwd();
const tmpdir = require('tmpgen')("test-replay/*");

function readCSV(path){
  return (
    fs
    .readFileSync(path,'utf8')
    .split("\n")
    .map((line)=>(line.split(",")))
  );
}

describe('dummy test', function(){
  it('should pass', function(){
    return true;
  });
});

describe('reconstruct from tradeLog', function(){
  let sim,simConfig;
  const pathToSimJSON=topPath+"/test/00/sim.json";
  const pathToTradeCSVInput=topPath+"/test/00/trade.csv";
  const workdir = tmpdir();
  before(function(){
    process.chdir(workdir);
    simConfig = JSON.parse(fs.readFileSync(pathToSimJSON));
    simConfig.logToFileSystem=true;
    simConfig.withoutOrderLogs=false;
    sim = new Simulation(simConfig);
    const tradeLog = {};
    tradeLog.data = readCSV(pathToTradeCSVInput);
    smrsReplay.modifySimulator(sim,{
      tradeLog
    });
    sim.run({sync:true});
  });
  it('final period should be 100', function(){
    sim.period.should.deepEqual(100);
  });
  describe('replay data output files match original data files', function(){
    const files = ["effalloc.csv","ohlc.csv","profit.csv","trade.csv"];
    files.forEach((f)=>{
      it(f, function(){
        const replayData = readCSV("./"+f);
        const originalData = readCSV(topPath+"/test/00/"+f);
        replayData.should.deepEqual(originalData);
      });
    });
  });
});

describe('reconstruct from presorted/combined orderLog', function(){
  let sim,simConfig;
  const pathToSimJSON=topPath+"/test/01/sim.json";
  const pathToOrderCSVInput=topPath+"/test/01/allorders-sorted.csv";
  const workdir = tmpdir();
  before(function(){
    process.chdir(workdir);
    simConfig = JSON.parse(fs.readFileSync(pathToSimJSON));
    simConfig.logToFileSystem=true;
    simConfig.withoutOrderLogs=false;
    sim = new Simulation(simConfig);
    const orderLog = {};
    orderLog.data = readCSV(pathToOrderCSVInput);
    smrsReplay.modifySimulator(sim,{
      orderLog
    });
    sim.run({sync:true});
  });
  it('final period should be 100', function(){
    sim.period.should.deepEqual(100);
  });
  describe('replay data output files match original data files', function(){
    const files = ["buyorder.csv","sellorder.csv","effalloc.csv","ohlc.csv","profit.csv","trade.csv"];
    files.forEach((f)=>{
      it(f, function(){
        const replayData = readCSV("./"+f);
        const originalData = readCSV(topPath+"/test/01/"+f);
        replayData.should.deepEqual(originalData);
      });
    });
  });
});
