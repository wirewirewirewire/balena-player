const util = require("util");
var path = require("path");
var fs = require("fs");
const dgram = require("dgram");
const Gpio = require("onoff").Gpio;
const socket = dgram.createSocket("udp4");
const { exec, spawn } = require("child_process");
const Parser = require("./parser.js");

const env = Object.create(process.env);
env.DISPLAY = ":0";
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const getVlcTimeCmd = `DISPLAY=:0 dbus-send --print-reply --session --dest=org.mpris.MediaPlayer2.vlc /org/mpris/MediaPlayer2 org.freedesktop.DBus.Properties.Get string:"org.mpris.MediaPlayer2.Player" string:"Position"`;

var vlcPlayerTask;
var udpTimer;

var ISINTEL = Parser.checkENV("ISINTEL", true);
var UDPENABLED = Parser.checkENV("UDPENABLED", false);
var DEBUG = Parser.checkENV("DEBUG", false);
var Volume = Parser.checkENV("VOLUME", 500);

const Buttons = [];
var State = {};
var BalenaRelease;
var BlockButton = false;
var StopMainFunction = false;

function IsJsonString(str) {
  var result;
  try {
    result = JSON.parse(str);
  } catch (e) {
    return str;
  }
  return result;
}

function buttonBlock() {
  BlockButton = true;
  setTimeout(function () {
    console.log("[MAIN] --- button release ---");
    BlockButton = false;
  }, 500);
}

function getBalenaRelease() {
  return new Promise((resolve, reject) => {
    exec(
      'curl -X GET --header "Content-Type:application/json" "$BALENA_SUPERVISOR_ADDRESS/v1/device?apikey=$BALENA_SUPERVISOR_API_KEY"',
      (error, stdout, stderr) => {
        if (error) {
          //console.log(`error: ${error.message}`);
          resolve(false);
          return;
        }
        if (stderr) {
          resolve(false);
          return;
          //console.log(`stderr: ${stderr}`);
          //resolve(stderr);
          //return;
        }
        resolve(IsJsonString(stdout));
      }
    );
  });
}

async function vlcKill() {
  return new Promise(async (resolve, reject) => {
    if (vlcPlayerTask != undefined) {
      buttonBlock();
      console.log("[VLC] kill VLC player");
      await vlcPlayerTask.kill();
      vlcPlayerTask = undefined;
      State.file = "";
      State.fileId = "";
      State.isPlaying = false;
      State.fileSlug = "";
      clearInterval(udpTimer);
      resolve(true);
    } else {
      if (DEBUG) console.log("[VLC] no player task");
      resolve(false);
    }
  });
}

let vlcGetTime = async function () {
  return new Promise(async (resolve, reject) => {
    if (DEBUG) console.log("[VLC] get time");
    if (vlcPlayerTask == undefined) {
      resolve(0);
      return;
    }
    exec(getVlcTimeCmd, (error, stdout, stderr) => {
      if (error) {
        console.log(`[VLC] get time Error: ${error.message}`);
        resolve(false);
        return;
      }
      if (stderr) {
        console.log(`stderr: ${stderr}`);
        resolve(false);
        return;
      }
      //if (DEBUG) console.log(`[VLC] get time stdout: ${stdout}`);
      let match = stdout.match(/(\d+)(?![\s\S]*\d)/);
      let lastNumber = match ? match[0] : null;
      lastNumber = Math.floor(lastNumber / 1000);
      resolve(lastNumber);
    });
  });
};

async function vlcPlayer(file, loop = false, volume = Volume, audio = false, fullscreen = false) {
  var fileName = file;

  State.isPlaying = true;
  State.file = file;
  State.fileId = Parser.getIdByFile(file);
  State.fileSlug = Parser.getSlugByFile(file);

  playerParams = ["--no-osd", "--play-and-exit", "--control", "dbus"];
  if (loop) {
    playerParams.push("--loop");
  }
  if (!audio) {
    playerParams.push("--no-audio");
  }
  //TODO check if we need to start fullsccreen or if performance is better without
  if (fullscreen) {
    playerParams.push("-f");
  }
  playerParams.push(fileName);

  return new Promise(async (resolve, reject) => {
    console.log("[VLC] start file: " + fileName);
    if (UDPENABLED) console.log('[UDP] stream will be: "' + Parser.getConfig().stationName + "%" + State.fileSlug + '%<playertime>%<unixtimestamp>"');

    if (DEBUG) console.log("[VLC]  params: " + playerParams);
    if (UDPENABLED) {
      udpTimer = setInterval(async () => {
        sendPostion(Parser.getConfig().stationName, State.fileSlug);
      }, 1000);
    }
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
      State.fileId = "";
      State.isPlaying = false;
      State.fileSlug = "";
    });
    resolve(vlcPlayer);
  });
}

async function vlcBlockPlaying() {
  return new Promise(async (resolve, reject) => {
    if (vlcPlayerTask != undefined) {
      if (DEBUG) console.log("[VLC] block - wait until vlc is finished ...");
      const checkIntervall = setInterval(async () => {
        if (vlcPlayerTask) {
          //if (DEBUG) console.log("[VLC] block - The process is still running.");
        } else {
          if (DEBUG) console.log("[VLC] block - The process has exited.");
          clearInterval(checkIntervall);
          setTimeout(() => {
            resolve(true);
          }, 100);
        }
      }, 100);
    } else {
      resolve(true);
    }
  });
}

async function vlcPlayFile(file, volume = Volume) {
  return new Promise(async (resolve, reject) => {
    await vlcKill();
    vlcPlayerTask = await vlcPlayer(file);
    await vlcBlockPlaying();
    resolve(true);
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
  console.log("[MAIN] --- start main loop ---");
  var customFunction = new AsyncFunction(mainFunction);
  var Config = new Parser.getConfig();
  var getFileById = Parser.getFileById;
  var getIdByFile = Parser.getIdByFile;
  var RestartMain = MainFunction;

  try {
    customFunction.call({
      vlcPlayFile,
      vlcPlayFileLoop,
      vlcKill,
      getFileById,
      getIdByFile,
      RestartMain,
      StartMain,
      StopMain,
      Config,
      State,
    });
    //setTimeout(MainFunction(mainFunction), 5000);
  } catch (e) {
    console.log("[MAIN] Import Code Error ");
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
    console.log("[MAIN] ---Button Trigger GPIO: " + Trigger.gpio + "---");
    if (Trigger.customFunction != null) {
      //StopMain();
      var customFunction = new AsyncFunction(Trigger.customFunction);
      var RestartMain = MainFunction;
      var Config = new Parser.getConfig();
      var getFileById = Parser.getFileById;
      var getIdByFile = Parser.getIdByFile;
      try {
        customFunction.call({
          vlcPlayFile,
          vlcPlayFileLoop,
          vlcKill,
          getFileById,
          getIdByFile,
          RestartMain,
          StartMain,
          StopMain,
          Config,
          Trigger,
          State,
        });
      } catch (e) {
        console.log("[MAIN] trigger Import Code Error");
        console.log(e);
      }
    } else {
      console.log("[MAIN] No Function for GPIO: " + Trigger.gpio);
    }
  });
}
//TODO check all files changes because more config files now
Parser.init({ configpath: "./media/", configfile: "data_files.json" }, DEBUG).then(function () {
  fs.watchFile(Parser.getConfigPath(), async (curr, prev) => {
    console.log("[MAIN] file changed, restart: " + Parser.getConfigPath());
    await vlcKill();
    process.kill(process.pid, "SIGUSR2");
    process.exit();
  });
  Parser.parseConfig().then(async (Config) => {
    //console.log("By ID XX " + Parser.getFileById(23));
    if (Config.files.length <= 0 && Config.trigger.length <= 0) {
      console.log("[MAIN] no files to play, restart ... ");
      await vlcKill();
      process.kill(process.pid, "SIGUSR2");
      process.exit();
    }
    BalenaRelease = await getBalenaRelease();
    if (BalenaRelease != false) {
      if (DEBUG) console.log(BalenaRelease);
      //let ipAddr = BalenaRelease.ip_address.split(" ");
    } else {
      console.log("[MAIN] start local, no balena");
    }
    if (!ISINTEL) {
      for (var i = 0; i < Config.trigger.length; i++) {
        if (Config.trigger[i].gpio != undefined) {
          console.log("[MAIN] --- attach gpio: " + Config.trigger[i].gpio + "---");
          attachButton(Config.trigger[i]);
        }
      }
    }
    console.log("[MAIN] --- INIT DONE ---");
    MainFunction();
  });
});

async function sendPostion(ID, FILE) {
  if (State.hasOwnProperty("isPlaying") && State.isPlaying == false) return;
  var vlcResult = await vlcGetTime();
  if (vlcResult == undefined || vlcResult == false) return;
  var timedata = Date.now();
  //Example : "2%sync.mp4%42558%1690464636403" position in ms, timedata in ts(ms) = Date.now();
  var sendstring = ID + "%" + FILE + "%" + vlcResult.toString() + "%" + timedata.toString();
  if (DEBUG) console.log('[UDP] send : "' + sendstring + '"');

  socket.setBroadcast(true);
  socket.send(sendstring, 0, sendstring.length, 6666, "255.255.255.255");
}

socket.bind("6666");

socket.on("listening", function () {
  const address = socket.address();
  console.log("[UDP] socket on " + address.address + ":" + address.port);
});

process.on("SIGINT", (_) => {
  //led.unexport();
  //button1.unexport();
  if (vlcPlayerTask != undefined) {
    vlcPlayerTask.kill();
  }
  process.exit();
});
