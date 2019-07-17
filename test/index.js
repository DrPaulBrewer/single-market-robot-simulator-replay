/* eslint-env node, mocha */
/* eslint no-sync: "off" */
const fs = require('fs');
global.fs = fs;
require('should');
const smrsReplay = require('../index.js');
const { Simulation } = require('single-market-robot-simulator');

const topPath = process.cwd();
const tmpdir = require('tmpgen')("test-replay/*");

function readCSV(path) {
  return (
    fs
    .readFileSync(path, 'utf8')
    .split("\n")
    .map((line) => (line.split(",")))
  );
}

const testsByLogType = {
  tradeLog: ['00','01'],
  orderLog: ['10']
};

const matchingFiles = {
  tradeLog: ["effalloc.csv", "ohlc.csv", "profit.csv", "trade.csv"],
  orderLog: ["buyorder.csv", "sellorder.csv", "effalloc.csv", "ohlc.csv", "profit.csv", "trade.csv"]
};

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
        it(f, function () {
          const replayData = readCSV(`./${f}`);
          const originalData = readCSV(`${topPath}/test/${subdir}/${f}`);
          replayData.should.deepEqual(originalData);
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
