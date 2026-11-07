const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("studyBuddy", Object.freeze({
  platform: process.platform
}));
