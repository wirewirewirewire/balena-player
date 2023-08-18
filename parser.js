const util = require("util");
const fs = require("fs");
var DEBUG = false;
const axios = require("axios");

var CONFIGPATH;
var CONFIGNAME;
var ConfigFile;
var Config;

//console.log(util.inspect(student, { showHidden: false, depth: null }));

function checkENV(ENV, alt_var, secret = false) {
  if (eval("process.env." + ENV)) {
    if (secret) {
      console.log("[VAR] set " + ENV + " from ENV to: ***");
    } else {
      console.log("[VAR] set " + ENV + " from ENV to: " + eval("process.env." + ENV));
    }
    let newVar = eval("process.env." + ENV);
    if (newVar == "true") newVar = true;
    if (newVar == "false") newVar = false;
    return newVar;
  } else {
    if (secret) {
      console.log("[VAR] set " + ENV + " from Default to: ***");
    } else {
      console.log("[VAR] set " + ENV + " from Default to: " + alt_var);
    }
    return alt_var;
  }
}

async function getMimeTypeFromUrl(url) {
  try {
    const response = await axios.head(url);
    return response.headers["content-type"];
  } catch (error) {
    console.error(`Error fetching the URL: ${error.message}`);
    return null;
  }
}

async function isVideoUrl(url) {
  const mimeType = await getMimeTypeFromUrl(url);
  if (!mimeType) {
    return false;
  }
  return mimeType.startsWith("video/");
}

function getSafe(fn, defaultVal) {
  try {
    return fn();
  } catch (e) {
    return defaultVal;
  }
}

module.exports = {
  init: function (settings = { configpath: "./media/", configfile: "config_files.json" }, debug) {
    return new Promise((resolve, reject) => {
      console.log("--------INIT PLAYER--------");

      CONFIGPATH = checkENV("CONFIGPATH", settings.configpath);
      CONFIGNAME = checkENV("CONFIGNAME", settings.configfile);
      let rawdata = fs.readFileSync(CONFIGPATH + CONFIGNAME);
      ConfigFile = JSON.parse(rawdata);
      DEBUG = debug;
      resolve(true);
    });
  },
  /*
  files:[{
    id: number,
    file: string,
    fileconfig:string,
    }...],
  trigger:[{ 
    id: number,
    customFunction: sring,
    gpio: number,
    }...]
*/
  parseConfig: function () {
    return new Promise(async (resolve, reject) => {
      var fileCount = getSafe(() => ConfigFile.data.post.entries.length, 0);
      var triggerCount = getSafe(() => ConfigFile.data.post.trigger.length, 0);
      let isFile = false;

      Config = { files: [], trigger: [], mainfunction: null, stationName: null };
      for (let i = 0; i < fileCount; i++) {
        let newFile = {
          id: getSafe(() => ConfigFile.data.post.entries[i].id, null),
          title: getSafe(() => ConfigFile.data.post.entries[i].title, null),
          slug: getSafe(() => ConfigFile.data.post.entries[i].slug, null), //TODO: add this to config file, get file by slug, relevant for udp broadcast
        };
        for (let j = 0; j < getSafe(() => ConfigFile.data.post.entries[i].files.length, 0); j++) {
          let videoFileUrl = ConfigFile.data.post.entries[i].files[j].file.url;
          let videoFileName = ConfigFile.data.post.entries[i].files[j].file.filename;
          if (await isVideoUrl(videoFileUrl)) {
            isFile = true;
            newFile["file"] = videoFileUrl;
            console.log("[PARSE] add file: " + videoFileName);
            break;
          }
        }
        if (isFile) Config.files.push(newFile);
      }
      for (var i = 0; i < triggerCount; i++) {
        Config.trigger.push(getSafe(() => ConfigFile.data.post.entries[i].trigger, null));
      }
      Config.mainfunction = getSafe(() => ConfigFile.data.post.content, null);
      Config.stationName = getSafe(() => ConfigFile.data.post.slug, null); //TODO: add this to config file, relevant for udp broadcast

      if (DEBUG) console.log(util.inspect(Config, { showHidden: false, depth: null }));
      if (DEBUG) console.log("[PARSE] Entries: " + fileCount + " Trigger: " + triggerCount);

      resolve(Config);
    });
  },
  getConfig: function () {
    return Config;
  },
  getConfigPath: function () {
    return CONFIGPATH + CONFIGNAME;
  },
  getBasePath: function () {
    return CONFIGPATH;
  },
  checkENV: function (ENV, alt_var, secret = false) {
    return checkENV(ENV, alt_var, (secret = false));
  },
  //Get File URL from Strapi Field ID
  getFileById: function (id) {
    for (var i = 0; i < getSafe(() => Config.files).length; i++) {
      if (getSafe(() => Config.files[i].id) === id) return Config.files[i].file;
    }
    return null;
  },
  getIdByFile: function (file) {
    //var file = file.replace(CONFIGPATH, "/");

    for (var i = 0; i < getSafe(() => Config.files).length; i++) {
      //console.log(file);
      //console.log(Config.files[i].file);
      if (getSafe(() => Config.files[i].file) === file) return getSafe(() => Config.files[i].id);
    }
    return null;
  },
  getSlugByFile: function (file) {
    //var file = file.replace(CONFIGPATH, "/");

    for (var i = 0; i < getSafe(() => Config.files).length; i++) {
      //console.log(file);
      //console.log(Config.files[i].file);
      if (getSafe(() => Config.files[i].file) === file) return getSafe(() => Config.files[i].slug);
    }
    return null;
  },
};
