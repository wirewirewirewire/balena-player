const util = require("util");
var path = require("path");
var psTree = require("ps-tree");
const Gpio = require("onoff").Gpio;
const { exec } = require("child_process");
var fs = require("fs");

const Parser = require("./parser.js");

const Buttons = [];
var State = {};
var BlockButton = false;
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

function OmxPlayFile(file, volume = Volume) {
  return new Promise(function (resolve, reject) {
    if (!BlockButton) {
      buttonBlock();
      OmxKill().then(function (result) {
        console.log("Play Video: " + file);
        PlayerTask = exec("omxplayer -o local --vol " + volume + " " + file);
        PlayerTask.on("exit", (code) => {
          console.log("child process exited with code " + code);
          resolve(true);
          //console.log(util.inspect(PlayerTask, { showHidden: false, depth: null }));
          /*if (PlayerTask != null && code == null && killed_uid == PlayerTask.pid) {
          console.log("Exit Killed PID: " + PlayerTask.pid);
          killall(PlayerTask.pid);
          PlayerTask = null;
        }*/
        });
        return true;
      });
    }
  });
}

async function OmxPlayFileLoop(file, volume = Volume) {
  for (var i = 0; i <= 3; i++) {
    await OmxPlayFile(file, volume);
    if (BlockButton) {
      console.log("Button breaks loop");
      break;
    }
  }
}

//ToDo: protect members (without status)
//Input: Trigger Object from Config Array
async function attachButton(Trigger /*number, file, isrepeat = false, isdefault = false*/) {
  Buttons[Trigger.gpio] = new Gpio(Trigger.gpio, "in", "rising", { debounceTimeout: 50 });
  Buttons[Trigger.gpio].watch((err, value) => {
    console.log("Button Trigger GPIO: " + Trigger.gpio);
    if (Trigger.customFunction != null) {
      var customFunction = new Function(Trigger.customFunction);
      var Config = new Parser.getConfig();
      var getFileById = Parser.getFileById;
      try {
        customFunction.call({
          OmxPlayFile,
          OmxPlayFileLoop,
          getFileById,
          OmxKill,
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
    process.kill(process.pid, "SIGUSR2");
    process.exit();
  });
  Volume = Parser.checkENV("VOLUME", 500);
  Parser.parseConfig().then(function (Config) {
    //console.log("By ID XX " + Parser.getFileById(23));

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
