/* eslint-env node, mocha */
/* eslint no-sync: "off" */
const fs = require('fs');
global.fs = fs;
require('should');
const smrsReplay = require('../index.js');
const { Simulation } = require('single-market-robot-simulator');

const topPath = process.cwd();
const tmpdir = require('tmpgen')("test-replay/*");
const csvParse = require('csv-parse/lib/sync');

function readCSV(path) {
  return csvParse(fs.readFileSync(path),{
    skip_empty_lines:true   // eslint-disable-line camelcase
  });
}

const testsByLogType = {
  tradeLog: ['00','01','02'],
  orderLog: ['10','11']
};

const matchingFiles = {
  tradeLog: ["effalloc.csv", "ohlc.csv", "profit.csv", "trade.csv"],
  orderLog: ["buyorder.csv", "sellorder.csv", "effalloc.csv", "ohlc.csv", "profit.csv", "trade.csv"]
};

const noMatchDuration = 'input data does not match sim.duration';
const noMatchDurationExceptions = {
  'ohlc.csv': {
    beginTime: noMatchDuration,
    endTime: noMatchDuration
  },
  'trade.csv': {
    tp: noMatchDuration
  },
  'buyorder.csv': {
    tp: noMatchDuration
  },
  'sellorder.csv': {
    tp: noMatchDuration
  }
};

const exceptions = {
  '02': noMatchDurationExceptions,
  '11': noMatchDurationExceptions
};

function hasException(subdir,f,h){
  return (
    exceptions &&
    exceptions[subdir] &&
    exceptions[subdir][f] &&
    exceptions[subdir][f][h]
  );
}

function testFunction(logKey, subdir) {
  return function () {
    let sim, simConfig;
    const pathToSimJSON = `${topPath}/test/${subdir}/sim.json`;
    const pathToTradeCSVInput = `${topPath}/test/${subdir}/trade.csv`;
    const tradeLog = {};
    const pathToOrderCSVInput = `${topPath}/test/${subdir}/allorders-sorted.csv`;
    const orderLog = {};
    const workdir = tmpdir();
    before(function () {
      process.chdir(workdir);
      simConfig = JSON.parse(fs.readFileSync(pathToSimJSON));
      simConfig.logToFileSystem = true;
      simConfig.withoutOrderLogs = false;
      sim = new Simulation(simConfig);
      switch (logKey) {
      case 'tradeLog':
        tradeLog.data = readCSV(pathToTradeCSVInput);
        smrsReplay.modifySimulator(sim, {
          tradeLog
        });
        break;
      case 'orderLog':
        orderLog.data = readCSV(pathToOrderCSVInput);
        smrsReplay.modifySimulator(sim, {
          orderLog
        });
        break;
      default:
        throw new Error("tests not defined for logKey = " + logKey);
      }
      sim.run({ sync: true });
    });
    describe('replay data output files should match original data files', function () {
      matchingFiles[logKey].forEach((f) => {
        const originalData = readCSV(`${topPath}/test/${subdir}/${f}`);
        let replayData;
        describe(f, function(){
          before(function(){
            replayData = readCSV(`./${f}`);
          });
          it('original and replay should have the same header', function(){
            replayData[0].should.deepEqual(originalData[0]);
          });
          originalData[0].forEach((h,j)=>{
            const exception = hasException(subdir,f,h);
            if (exception){
              it(`${f} col ${h} won't match because ${exception}`, function(){
                const replayColumn = replayData.map((row)=>(row && row[j]));
                const originalColumn =  originalData.map((row)=>(row && row[j]));
                replayColumn.should.not.deepEqual(originalColumn);
              });
            } else{
              it(`${f} col ${h} matches`, function(){
                const replayColumn = replayData.map((row)=>(row && row[j]));
                const originalColumn =  originalData.map((row)=>(row && row[j]));
                replayColumn.should.deepEqual(originalColumn);
              });
            }
          });
        });
      });
    });
  };
}

Object.keys(testsByLogType).forEach((k) => {
  describe("reconstruct from " + k, function () {
    testsByLogType[k].forEach((subdir) => {
      describe("/test/" + subdir, testFunction(k, subdir));
    });
  });
});
