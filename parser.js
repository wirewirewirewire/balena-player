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
      var fileCount = getSafe(() => ConfigFile.deviceKind[0].files.length, 0);
      var triggerCount = getSafe(() => ConfigFile.deviceKind[0].Trigger.length, 0);

      Config = { files: [], trigger: [], mainfunction: null };
      for (var i = 0; i < fileCount; i++) {
        let newFile = {
          id: getSafe(() => ConfigFile.deviceKind[0].files[i].id, null),
          file: getSafe(() => ConfigFile.deviceKind[0].files[i].file.url, null),
          fileconfig: getSafe(() => ConfigFile.deviceKind[0].files[i].fileconfig, null),
        };
        Config.files.push(newFile);
      }
      for (var i = 0; i < triggerCount; i++) {
        Config.trigger.push(getSafe(() => ConfigFile.deviceKind[0].Trigger[i], null));
      }
      Config.mainfunction = getSafe(() => ConfigFile.deviceKind[0].mainFunction, null);

      console.log("Parsed: Files: " + fileCount + " Trigger: " + triggerCount);
      //console.log(util.inspect(Config, { showHidden: false, depth: null }));

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
      if (getSafe(() => Config.files[i].id === id)) return CONFIGPATH.substring(0, CONFIGPATH.length - 1) + getSafe(() => Config.files[i].file);
    }
    return null;
  },
};
