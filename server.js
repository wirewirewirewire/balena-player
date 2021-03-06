const util = require("util");
var path = require("path");
var psTree = require("ps-tree");
const Gpio = require("onoff").Gpio;
const { exec } = require("child_process");
var fs = require("fs");
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

const Parser = require("./parser.js");

const Buttons = [];
var State = {};
var BlockButton = false;
var StopMainFunction = false;
var PlayerTask = null;
var Volume = 500;

var killall = function (pid, signal, callback) {
  signal = signal || "SIGKILL";
  callback = callback || function () {};
  var killTree = true;
  if (killTree) {
    psTree(pid, function (err, children) {
      [pid]
        .concat(
          children.map(function (p) {
            return p.PID;
          })
        )
        .forEach(function (tpid) {
          try {
            process.kill(tpid, signal);
          } catch (ex) {}
        });
      callback();
    });
  } else {
    try {
      process.kill(pid, signal);
    } catch (ex) {}
    callback();
  }
};

function buttonBlock() {
  BlockButton = true;
  setTimeout(function () {
    console.log("--------Button Released-----------");
    BlockButton = false;
  }, 500);
}

function OmxKill() {
  return new Promise(function (resolve, reject) {
    if (PlayerTask != null) {
      buttonBlock();
      console.log("Kill Player PID" + PlayerTask.pid);
      //killed_uid = PlayerTask.pid;
      //PlayerTask.stdin.write("q");
      killall(PlayerTask.pid, "SIGKILL", function () {
        resolve(true);
      });
    } else {
      resolve(true);
    }
  });
}

async function OmxPlayFile(file, volume = Volume) {
  return new Promise((resolve, reject) => {
    if (!BlockButton) {
      OmxKill().then((result) => {
        console.log("Play Video: " + file);
        State.file = file;
        State.fileId = Parser.getIdByFile(file);
        State.isPlaying = true;
        PlayerTask = exec("omxplayer -o local --vol " + volume + " " + file);
        PlayerTask.on("exit", (code) => {
          console.log("child process exited with code " + code);
          if (code == 0) {
            State.isPlaying = false;
          }
          resolve(true);
          //console.log(util.inspect(PlayerTask, { showHidden: false, depth: null }));
        });
        //return true;
      });
    } else {
      console.log("Button still blocked");
    }
  });
}

async function OmxPlayFileLoop(file, volume = Volume) {
  while (true) {
    await OmxPlayFile(file, volume);
    if (BlockButton) {
      console.log("EXIT OMX LOOP");
      break;
    }
  }
}

function StopMain() {
  return new Promise((resolve, reject) => {
    StopMainFunction = true;
    resolve(true);
  });
}

function StartMain() {
  StopMainFunction = false;
  MainFunction();
}

function MainFunction(mainFunction = Parser.getConfig().mainfunction) {
  if (StopMainFunction || BlockButton) return;
  console.log("-----START MAIN----");
  //if (mainFunction != null) {
  var customFunction = new AsyncFunction(mainFunction);
  //customFunction = new AsyncFunction(customFunction);
  var Config = new Parser.getConfig();
  var getFileById = Parser.getFileById;
  var getIdByFile = Parser.getIdByFile;
  var RestartMain = MainFunction;

  try {
    customFunction.call({
      OmxPlayFile,
      OmxPlayFileLoop,
      getFileById,
      getIdByFile,
      RestartMain,
      StartMain,
      StopMain,
      OmxKill,
      Config,
      State,
    });
    //setTimeout(MainFunction(mainFunction), 5000);
  } catch (e) {
    console.log("Import Code Error ");
    console.log(e);
  }
  /*} else {
    console.log("No Main Function");
  }*/
}

//ToDo: protect members (without status)
//Input: Trigger Object from Config Array
function attachButton(Trigger /*number, file, isrepeat = false, isdefault = false*/) {
  Buttons[Trigger.gpio] = new Gpio(Trigger.gpio, "in", "falling", { debounceTimeout: 50 });
  Buttons[Trigger.gpio].watch((err, value) => {
    console.log("-----Button Trigger GPIO: " + Trigger.gpio + "------");
    if (Trigger.customFunction != null) {
      //StopMain();
      var customFunction = new AsyncFunction(Trigger.customFunction);
      var RestartMain = MainFunction;
      var Config = new Parser.getConfig();
      var getFileById = Parser.getFileById;
      var getIdByFile = Parser.getIdByFile;
      try {
        customFunction.call({
          OmxPlayFile,
          OmxPlayFileLoop,
          getFileById,
          getIdByFile,
          OmxKill,
          RestartMain,
          StartMain,
          StopMain,
          Config,
          Trigger,
          State,
        });
      } catch (e) {
        console.log("Import Code Error");
        console.log(e);
      }
    } else {
      console.log("No Function for GPIO: " + Trigger.gpio);
    }
  });
}

Parser.init({ configpath: "./media/", configfile: "config_files.json" }).then(function () {
  fs.watchFile(Parser.getConfigPath(), (curr, prev) => {
    console.log("Restart from File Change: " + Parser.getConfigPath());
    OmxKill().then(() => {
      process.kill(process.pid, "SIGUSR2");
      process.exit();
    });
  });
  Volume = Parser.checkENV("VOLUME", 500);
  Parser.parseConfig().then((Config) => {
    //console.log("By ID XX " + Parser.getFileById(23));
    MainFunction();
    for (var i = 0; i < Config.trigger.length; i++) {
      if (Config.trigger[i].gpio != undefined) {
        console.log("----------NEW BUTTON GPIO: " + Config.trigger[i].gpio + "--------");
        attachButton(Config.trigger[i]);
      }
    }

    console.log("----------INIT DONE-----------------");
  });
});

process.on("SIGINT", (_) => {
  //led.unexport();
  //button1.unexport();
});
