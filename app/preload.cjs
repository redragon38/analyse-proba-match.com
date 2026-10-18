const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld(
  "studio",
  Object.freeze({
    request: async (input) => {
      const result = await ipcRenderer.invoke("studio:request", input);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
  }),
);
