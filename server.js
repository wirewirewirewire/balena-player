const util = require("util");
var path = require("path");
var psTree = require("ps-tree");
const Gpio = require("onoff").Gpio;
const { exec, spawn } = require("child_process");
var fs = require("fs");
const Parser = require("./parser.js");
const dgram = require("dgram");
const socket = dgram.createSocket("udp4");

const env = Object.create(process.env);
env.DISPLAY = ":0";
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const getVlcTimeCmd = `DISPLAY=:0 dbus-send --print-reply --session --dest=org.mpris.MediaPlayer2.vlc /org/mpris/MediaPlayer2 org.freedesktop.DBus.Properties.Get string:"org.mpris.MediaPlayer2.Player" string:"Position"`;

const Buttons = [];
var State = {};
var vlcPlayerTask;
var PlayerTask = null;
var udpTimer;
var RPI = false;

var DEBUG = false;
var STATION_ID = 0;

var BlockButton = false;
var StopMainFunction = false;
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

async function vlcKill() {
  return new Promise((resolve, reject) => {
    if (vlcPlayerTask != undefined) {
      console.log("[VLC] kill VLC player");
      vlcPlayerTask.kill();
      vlcPlayerTask = undefined;
      State.file = "";
      State.isPlaying = false;
      clearInterval(udpTimer);
      resolve(true);
    } else {
      console.log("[VLC] no player task");
      resolve(false);
    }
  });
}

let vlcGetTime = async function () {
  return new Promise(async (resolve, reject) => {
    if (DEBUG) console.log("[VLC] get time");
    exec(getVlcTimeCmd, (error, stdout, stderr) => {
      if (error) {
        console.log(`Error: ${error.message}`);
        resolve(false);
        return;
      }
      if (stderr) {
        console.log(`stderr: ${stderr}`);
        resolve(false);
        return;
      }
      if (DEBUG) console.log(`stdout: ${stdout}`);
      let match = stdout.match(/(\d+)(?![\s\S]*\d)/);
      let lastNumber = match ? match[0] : null;
      lastNumber = Math.floor(lastNumber / 1000);
      resolve(lastNumber);
    });
  });
};

async function vlcPlayer(file, loop = false, volume = Volume, audio = false, fullscreen = true) {
  var fileName = file;
  try {
    State.file = path.basename(fileName);
  } catch (error) {
    console.log("[VLC] ERR no valid file path");
    return false;
  }
  State.isPlaying = true;
  playerParams = ["--no-osd", "--play-and-exit", "--control", "dbus"];
  if (loop) {
    playerParams.push("--loop");
  }
  if (!audio) {
    playerParams.push("--no-audio");
  }
  if (fullscreen) {
    playerParams.push("-f");
  }
  playerParams.push(fileName);

  return new Promise(async (resolve, reject) => {
    console.log("[VLC] start file: " + fileName + " with params: " + playerParams);

    udpTimer = setInterval(async () => {
      sendPostion(STATION_ID, State.file);
    }, 1000);
    var vlcPlayer = spawn("cvlc", playerParams, { env: env });

    vlcPlayer.stdout.on("data", (data) => {
      console.error(`[VLC] stdout: ${data}`);
    });

    vlcPlayer.stderr.on("data", (data) => {
      if (DEBUG) console.error(`[VLC] stderr: ${data}`);
    });

    vlcPlayer.on("close", (code) => {
      console.log(`[VLC] exit with code ${code}`);
      clearInterval(udpTimer);
      vlcPlayerTask = undefined;
      State.file = "";
      State.isPlaying = false;
    });
    resolve(vlcPlayer);
  });
}

async function vlcBlockPlaying() {
  return new Promise(async (resolve, reject) => {
    if (vlcPlayerTask != undefined) {
      const checkIntervall = setInterval(async () => {
        if (vlcPlayerTask) {
          if (DEBUG) console.log("[VLC] The process is still running.");
        } else {
          if (DEBUG) console.log("[VLC] The process has exited.");
          clearInterval(checkIntervall);
          resolve(true);
        }
      }, 1000);
    } else {
      resolve(true);
    }
  });
}

async function vlcPlayFile(file, volume = Volume) {
  return new Promise(async (resolve, reject) => {
    vlcKill();
    vlcPlayerTask = await vlcPlayer(file);
  });
}
async function vlcPlayFileLoop(file, volume = Volume) {
  return new Promise(async (resolve, reject) => {
    while (true) {
      await vlcKill();
      vlcPlayerTask = await vlcPlayer(file);
      await vlcBlockPlaying();
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
      vlcPlayFile,
      vlcPlayFileLoop,
      vlcKill,
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
          vlcPlayFile,
          vlcPlayFileLoop,
          vlcKill,
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
    if (RPI) {
      for (var i = 0; i < Config.trigger.length; i++) {
        if (Config.trigger[i].gpio != undefined) {
          console.log("----------NEW BUTTON GPIO: " + Config.trigger[i].gpio + "--------");
          attachButton(Config.trigger[i]);
        }
      }
    }

    console.log("----------INIT DONE-----------------");
  });
});

async function sendPostion(ID, FILE) {
  if (State.hasOwnProperty("isPlaying") && State.isPlaying == false) return;
  var vlcResult = await vlcGetTime();
  if (vlcResult == undefined || vlcResult == false) return;
  var timedata = Date.now();
  console.log("[UDP ] send position: " + vlcResult);
  //Example : "2%sync.mp4%42558%1690464636403" position in ms, timedata in ts(ms) = Date.now();
  var sendstring = ID + "%" + FILE + "%" + vlcResult.toString() + "%" + timedata.toString();
  socket.setBroadcast(true);
  socket.send(sendstring, 0, sendstring.length, 6666, "255.255.255.255");
}

socket.bind("6666");

socket.on("listening", function () {
  const address = socket.address();
  console.log("[UDP] socket listening on " + address.address + ":" + address.port);
});

process.on("SIGINT", (_) => {
  //led.unexport();
  //button1.unexport();
  if (vlcPlayerTask != undefined) {
    vlcPlayerTask.kill();
  }
  process.exit();
});
