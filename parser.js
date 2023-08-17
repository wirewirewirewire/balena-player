const util = require("util");
const fs = require("fs");
var CONFIGPATH;
var CONFIGNAME;
var ConfigFile;
var Config;

//console.log(util.inspect(student, { showHidden: false, depth: null }));

function checkENV(ENV, alt_var, secret = false) {
  if (eval("process.env." + ENV)) {
    if (secret) {
      console.log("Set " + ENV + " from ENV to: ***");
    } else {
      console.log("Set " + ENV + " from ENV to: " + eval("process.env." + ENV));
    }
    return eval("process.env." + ENV);
  } else {
    if (secret) {
      console.log("Set " + ENV + " from Default to: ***");
    } else {
      console.log("Set " + ENV + " from Default to: " + alt_var);
    }
    return alt_var;
  }
}

function getSafe(fn, defaultVal) {
  try {
    return fn();
  } catch (e) {
    return defaultVal;
  }
}

module.exports = {
  init: function (settings = { configpath: "./media/", configfile: "config_files.json" }) {
    return new Promise((resolve, reject) => {
      console.log("--------INIT PLAYER--------");

      CONFIGPATH = checkENV("CONFIGPATH", settings.configpath);
      CONFIGNAME = checkENV("CONFIGNAME", settings.configfile);
      let rawdata = fs.readFileSync(CONFIGPATH + CONFIGNAME);
      ConfigFile = JSON.parse(rawdata);
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
    return new Promise((resolve, reject) => {
      //console.log(configfile);
      //console.log(util.inspect(ConfigFile, { showHidden: false, depth: null }));
      var fileCount = getSafe(() => ConfigFile.data.post.entries.length, 0);
      var triggerCount = getSafe(() => ConfigFile.data.post.trigger.length, 0);

      Config = { files: [], trigger: [], mainfunction: null, station: null };
      for (var i = 0; i < fileCount; i++) {
        let newFile = {
          id: getSafe(() => ConfigFile.data.post.entries[i].files[0].id, null),
          file: getSafe(() => ConfigFile.data.post.entries[i].files[0].file.url, null),
          slug: getSafe(() => ConfigFile.data.post.entries[i].slug, null),
        };//TODO: add maybe conversion of file url to slug (only file name)
        Config.files.push(newFile);
      }
      for (var i = 0; i < triggerCount; i++) {
        Config.trigger.push(getSafe(() => ConfigFile.data.post.entries[i].trigger, null));
      }
      Config.mainfunction = getSafe(() => ConfigFile.data.post.content, null);
      Config.station= getSafe(() => ConfigFile.data.post.stationId, null),


      console.log(util.inspect(Config, { showHidden: false, depth: null }));
      console.log("Parsed: Files: " + fileCount + " Trigger: " + triggerCount);

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
};
