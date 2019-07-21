#!/usr/bin/env node
/* Copyright 2019 Paul Brewer, Economic and Financial Technology Consulting LLC
 * This file is open source software.
 * The MIT LICENSE applies to this software.
 */

 /* eslint-env node */
 /* eslint no-sync: "off" */

const fs = require('fs');
global.fs = fs;
const program = require('commander');
const replay = require('./index.js');
const csvParse = require('csv-parse/lib/sync');
const { Simulation } = require('single-market-robot-simulator');

function replayTask(options){
  const startDate = Date.now();
  if (options && options.trade && options.order){
    console.log("Usage requires one of --order or --trade, not both");
    throw new Error("Improper Usage");
  }
  if ((!options.trade) && (!options.order)){
    console.log("Usage requires one of --order or --trade");
    throw new Error("Improper Usage");
  }
  if (options && options.verbose){
    console.log(new Date(startDate).toUTCString() + " -- smrs-replay v"+options.version());
    if (options.order) console.log(" --order");
    if (options.trade) console.log(" --trade");
  }
  const simConfig = JSON.parse(fs.readFileSync('./sim.json','utf8'));
  simConfig.logToFileSystem = true;
  if (options.verbose) simConfig.quiet = false;
  const sim = new Simulation(simConfig);
  const replayOptions = {};
  if (options.order) replayOptions.orderLog = {
    data: csvParse(fs.readFileSync('order-replay.csv'),{
            skip_empty_lines:true   // eslint-disable-line camelcase
          })
  };
  if (options.trade) replayOptions.tradeLog = {
    data: csvParse(fs.readFileSync('trade-replay.csv'),{
            skip_empty_lines:true   // eslint-disable-line camelcase
          })
  };
  replay.modifySimulator(sim,replayOptions);
  sim.run({sync:true});
}

(program
  .version('0.7.0')
  .option('-o, --order', 'use order-replay.csv as replication input')
  .option('-t, --trade', 'use trade-replay.csv as replication input')
  .option('-v, --verbose', 'print more status messages')
  .action(replayTask)
  .parse(process.argv)
);
