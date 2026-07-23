var trtFirebaseAuthNative = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
    get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
  }) : x)(function(x) {
    if (typeof require !== "undefined") return require.apply(this, arguments);
    throw Error('Dynamic require of "' + x + '" is not supported');
  });
  var __esm = (fn, res) => function __init() {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };

  // node_modules/@capacitor/core/dist/index.js
  var createCapacitorPlatforms, initPlatforms, CapacitorPlatforms, addPlatform, setPlatform, ExceptionCode, CapacitorException, getPlatformId, createCapacitor, initCapacitorGlobal, Capacitor, registerPlugin, Plugins, WebPlugin, encode, decode, CapacitorCookiesPluginWeb, CapacitorCookies, readBlobAsBase64, normalizeHttpHeaders, buildUrlParams, buildRequestInit, CapacitorHttpPluginWeb, CapacitorHttp;
  var init_dist = __esm({
    "node_modules/@capacitor/core/dist/index.js"() {
      createCapacitorPlatforms = (win) => {
        const defaultPlatformMap = /* @__PURE__ */ new Map();
        defaultPlatformMap.set("web", { name: "web" });
        const capPlatforms = win.CapacitorPlatforms || {
          currentPlatform: { name: "web" },
          platforms: defaultPlatformMap
        };
        const addPlatform2 = (name, platform) => {
          capPlatforms.platforms.set(name, platform);
        };
        const setPlatform2 = (name) => {
          if (capPlatforms.platforms.has(name)) {
            capPlatforms.currentPlatform = capPlatforms.platforms.get(name);
          }
        };
        capPlatforms.addPlatform = addPlatform2;
        capPlatforms.setPlatform = setPlatform2;
        return capPlatforms;
      };
      initPlatforms = (win) => win.CapacitorPlatforms = createCapacitorPlatforms(win);
      CapacitorPlatforms = /* @__PURE__ */ initPlatforms(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : typeof global !== "undefined" ? global : {});
      addPlatform = CapacitorPlatforms.addPlatform;
      setPlatform = CapacitorPlatforms.setPlatform;
      (function(ExceptionCode2) {
        ExceptionCode2["Unimplemented"] = "UNIMPLEMENTED";
        ExceptionCode2["Unavailable"] = "UNAVAILABLE";
      })(ExceptionCode || (ExceptionCode = {}));
      CapacitorException = class extends Error {
        constructor(message, code, data) {
          super(message);
          this.message = message;
          this.code = code;
          this.data = data;
        }
      };
      getPlatformId = (win) => {
        var _a, _b;
        if (win === null || win === void 0 ? void 0 : win.androidBridge) {
          return "android";
        } else if ((_b = (_a = win === null || win === void 0 ? void 0 : win.webkit) === null || _a === void 0 ? void 0 : _a.messageHandlers) === null || _b === void 0 ? void 0 : _b.bridge) {
          return "ios";
        } else {
          return "web";
        }
      };
      createCapacitor = (win) => {
        var _a, _b, _c, _d, _e;
        const capCustomPlatform = win.CapacitorCustomPlatform || null;
        const cap = win.Capacitor || {};
        const Plugins2 = cap.Plugins = cap.Plugins || {};
        const capPlatforms = win.CapacitorPlatforms;
        const defaultGetPlatform = () => {
          return capCustomPlatform !== null ? capCustomPlatform.name : getPlatformId(win);
        };
        const getPlatform = ((_a = capPlatforms === null || capPlatforms === void 0 ? void 0 : capPlatforms.currentPlatform) === null || _a === void 0 ? void 0 : _a.getPlatform) || defaultGetPlatform;
        const defaultIsNativePlatform = () => getPlatform() !== "web";
        const isNativePlatform = ((_b = capPlatforms === null || capPlatforms === void 0 ? void 0 : capPlatforms.currentPlatform) === null || _b === void 0 ? void 0 : _b.isNativePlatform) || defaultIsNativePlatform;
        const defaultIsPluginAvailable = (pluginName) => {
          const plugin = registeredPlugins.get(pluginName);
          if (plugin === null || plugin === void 0 ? void 0 : plugin.platforms.has(getPlatform())) {
            return true;
          }
          if (getPluginHeader(pluginName)) {
            return true;
          }
          return false;
        };
        const isPluginAvailable = ((_c = capPlatforms === null || capPlatforms === void 0 ? void 0 : capPlatforms.currentPlatform) === null || _c === void 0 ? void 0 : _c.isPluginAvailable) || defaultIsPluginAvailable;
        const defaultGetPluginHeader = (pluginName) => {
          var _a2;
          return (_a2 = cap.PluginHeaders) === null || _a2 === void 0 ? void 0 : _a2.find((h) => h.name === pluginName);
        };
        const getPluginHeader = ((_d = capPlatforms === null || capPlatforms === void 0 ? void 0 : capPlatforms.currentPlatform) === null || _d === void 0 ? void 0 : _d.getPluginHeader) || defaultGetPluginHeader;
        const handleError = (err) => win.console.error(err);
        const pluginMethodNoop = (_target, prop, pluginName) => {
          return Promise.reject(`${pluginName} does not have an implementation of "${prop}".`);
        };
        const registeredPlugins = /* @__PURE__ */ new Map();
        const defaultRegisterPlugin = (pluginName, jsImplementations = {}) => {
          const registeredPlugin = registeredPlugins.get(pluginName);
          if (registeredPlugin) {
            console.warn(`Capacitor plugin "${pluginName}" already registered. Cannot register plugins twice.`);
            return registeredPlugin.proxy;
          }
          const platform = getPlatform();
          const pluginHeader = getPluginHeader(pluginName);
          let jsImplementation;
          const loadPluginImplementation = async () => {
            if (!jsImplementation && platform in jsImplementations) {
              jsImplementation = typeof jsImplementations[platform] === "function" ? jsImplementation = await jsImplementations[platform]() : jsImplementation = jsImplementations[platform];
            } else if (capCustomPlatform !== null && !jsImplementation && "web" in jsImplementations) {
              jsImplementation = typeof jsImplementations["web"] === "function" ? jsImplementation = await jsImplementations["web"]() : jsImplementation = jsImplementations["web"];
            }
            return jsImplementation;
          };
          const createPluginMethod = (impl, prop) => {
            var _a2, _b2;
            if (pluginHeader) {
              const methodHeader = pluginHeader === null || pluginHeader === void 0 ? void 0 : pluginHeader.methods.find((m) => prop === m.name);
              if (methodHeader) {
                if (methodHeader.rtype === "promise") {
                  return (options) => cap.nativePromise(pluginName, prop.toString(), options);
                } else {
                  return (options, callback) => cap.nativeCallback(pluginName, prop.toString(), options, callback);
                }
              } else if (impl) {
                return (_a2 = impl[prop]) === null || _a2 === void 0 ? void 0 : _a2.bind(impl);
              }
            } else if (impl) {
              return (_b2 = impl[prop]) === null || _b2 === void 0 ? void 0 : _b2.bind(impl);
            } else {
              throw new CapacitorException(`"${pluginName}" plugin is not implemented on ${platform}`, ExceptionCode.Unimplemented);
            }
          };
          const createPluginMethodWrapper = (prop) => {
            let remove;
            const wrapper = (...args) => {
              const p = loadPluginImplementation().then((impl) => {
                const fn = createPluginMethod(impl, prop);
                if (fn) {
                  const p2 = fn(...args);
                  remove = p2 === null || p2 === void 0 ? void 0 : p2.remove;
                  return p2;
                } else {
                  throw new CapacitorException(`"${pluginName}.${prop}()" is not implemented on ${platform}`, ExceptionCode.Unimplemented);
                }
              });
              if (prop === "addListener") {
                p.remove = async () => remove();
              }
              return p;
            };
            wrapper.toString = () => `${prop.toString()}() { [capacitor code] }`;
            Object.defineProperty(wrapper, "name", {
              value: prop,
              writable: false,
              configurable: false
            });
            return wrapper;
          };
          const addListener = createPluginMethodWrapper("addListener");
          const removeListener = createPluginMethodWrapper("removeListener");
          const addListenerNative = (eventName, callback) => {
            const call = addListener({ eventName }, callback);
            const remove = async () => {
              const callbackId = await call;
              removeListener({
                eventName,
                callbackId
              }, callback);
            };
            const p = new Promise((resolve) => call.then(() => resolve({ remove })));
            p.remove = async () => {
              console.warn(`Using addListener() without 'await' is deprecated.`);
              await remove();
            };
            return p;
          };
          const proxy = new Proxy({}, {
            get(_, prop) {
              switch (prop) {
                // https://github.com/facebook/react/issues/20030
                case "$$typeof":
                  return void 0;
                case "toJSON":
                  return () => ({});
                case "addListener":
                  return pluginHeader ? addListenerNative : addListener;
                case "removeListener":
                  return removeListener;
                default:
                  return createPluginMethodWrapper(prop);
              }
            }
          });
          Plugins2[pluginName] = proxy;
          registeredPlugins.set(pluginName, {
            name: pluginName,
            proxy,
            platforms: /* @__PURE__ */ new Set([
              ...Object.keys(jsImplementations),
              ...pluginHeader ? [platform] : []
            ])
          });
          return proxy;
        };
        const registerPlugin2 = ((_e = capPlatforms === null || capPlatforms === void 0 ? void 0 : capPlatforms.currentPlatform) === null || _e === void 0 ? void 0 : _e.registerPlugin) || defaultRegisterPlugin;
        if (!cap.convertFileSrc) {
          cap.convertFileSrc = (filePath) => filePath;
        }
        cap.getPlatform = getPlatform;
        cap.handleError = handleError;
        cap.isNativePlatform = isNativePlatform;
        cap.isPluginAvailable = isPluginAvailable;
        cap.pluginMethodNoop = pluginMethodNoop;
        cap.registerPlugin = registerPlugin2;
        cap.Exception = CapacitorException;
        cap.DEBUG = !!cap.DEBUG;
        cap.isLoggingEnabled = !!cap.isLoggingEnabled;
        cap.platform = cap.getPlatform();
        cap.isNative = cap.isNativePlatform();
        return cap;
      };
      initCapacitorGlobal = (win) => win.Capacitor = createCapacitor(win);
      Capacitor = /* @__PURE__ */ initCapacitorGlobal(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : typeof global !== "undefined" ? global : {});
      registerPlugin = Capacitor.registerPlugin;
      Plugins = Capacitor.Plugins;
      WebPlugin = class {
        constructor(config) {
          this.listeners = {};
          this.retainedEventArguments = {};
          this.windowListeners = {};
          if (config) {
            console.warn(`Capacitor WebPlugin "${config.name}" config object was deprecated in v3 and will be removed in v4.`);
            this.config = config;
          }
        }
        addListener(eventName, listenerFunc) {
          let firstListener = false;
          const listeners = this.listeners[eventName];
          if (!listeners) {
            this.listeners[eventName] = [];
            firstListener = true;
          }
          this.listeners[eventName].push(listenerFunc);
          const windowListener = this.windowListeners[eventName];
          if (windowListener && !windowListener.registered) {
            this.addWindowListener(windowListener);
          }
          if (firstListener) {
            this.sendRetainedArgumentsForEvent(eventName);
          }
          const remove = async () => this.removeListener(eventName, listenerFunc);
          const p = Promise.resolve({ remove });
          return p;
        }
        async removeAllListeners() {
          this.listeners = {};
          for (const listener in this.windowListeners) {
            this.removeWindowListener(this.windowListeners[listener]);
          }
          this.windowListeners = {};
        }
        notifyListeners(eventName, data, retainUntilConsumed) {
          const listeners = this.listeners[eventName];
          if (!listeners) {
            if (retainUntilConsumed) {
              let args = this.retainedEventArguments[eventName];
              if (!args) {
                args = [];
              }
              args.push(data);
              this.retainedEventArguments[eventName] = args;
            }
            return;
          }
          listeners.forEach((listener) => listener(data));
        }
        hasListeners(eventName) {
          return !!this.listeners[eventName].length;
        }
        registerWindowListener(windowEventName, pluginEventName) {
          this.windowListeners[pluginEventName] = {
            registered: false,
            windowEventName,
            pluginEventName,
            handler: (event) => {
              this.notifyListeners(pluginEventName, event);
            }
          };
        }
        unimplemented(msg = "not implemented") {
          return new Capacitor.Exception(msg, ExceptionCode.Unimplemented);
        }
        unavailable(msg = "not available") {
          return new Capacitor.Exception(msg, ExceptionCode.Unavailable);
        }
        async removeListener(eventName, listenerFunc) {
          const listeners = this.listeners[eventName];
          if (!listeners) {
            return;
          }
          const index = listeners.indexOf(listenerFunc);
          this.listeners[eventName].splice(index, 1);
          if (!this.listeners[eventName].length) {
            this.removeWindowListener(this.windowListeners[eventName]);
          }
        }
        addWindowListener(handle) {
          window.addEventListener(handle.windowEventName, handle.handler);
          handle.registered = true;
        }
        removeWindowListener(handle) {
          if (!handle) {
            return;
          }
          window.removeEventListener(handle.windowEventName, handle.handler);
          handle.registered = false;
        }
        sendRetainedArgumentsForEvent(eventName) {
          const args = this.retainedEventArguments[eventName];
          if (!args) {
            return;
          }
          delete this.retainedEventArguments[eventName];
          args.forEach((arg) => {
            this.notifyListeners(eventName, arg);
          });
        }
      };
      encode = (str) => encodeURIComponent(str).replace(/%(2[346B]|5E|60|7C)/g, decodeURIComponent).replace(/[()]/g, escape);
      decode = (str) => str.replace(/(%[\dA-F]{2})+/gi, decodeURIComponent);
      CapacitorCookiesPluginWeb = class extends WebPlugin {
        async getCookies() {
          const cookies = document.cookie;
          const cookieMap = {};
          cookies.split(";").forEach((cookie) => {
            if (cookie.length <= 0)
              return;
            let [key, value] = cookie.replace(/=/, "CAP_COOKIE").split("CAP_COOKIE");
            key = decode(key).trim();
            value = decode(value).trim();
            cookieMap[key] = value;
          });
          return cookieMap;
        }
        async setCookie(options) {
          try {
            const encodedKey = encode(options.key);
            const encodedValue = encode(options.value);
            const expires = `; expires=${(options.expires || "").replace("expires=", "")}`;
            const path = (options.path || "/").replace("path=", "");
            const domain = options.url != null && options.url.length > 0 ? `domain=${options.url}` : "";
            document.cookie = `${encodedKey}=${encodedValue || ""}${expires}; path=${path}; ${domain};`;
          } catch (error) {
            return Promise.reject(error);
          }
        }
        async deleteCookie(options) {
          try {
            document.cookie = `${options.key}=; Max-Age=0`;
          } catch (error) {
            return Promise.reject(error);
          }
        }
        async clearCookies() {
          try {
            const cookies = document.cookie.split(";") || [];
            for (const cookie of cookies) {
              document.cookie = cookie.replace(/^ +/, "").replace(/=.*/, `=;expires=${(/* @__PURE__ */ new Date()).toUTCString()};path=/`);
            }
          } catch (error) {
            return Promise.reject(error);
          }
        }
        async clearAllCookies() {
          try {
            await this.clearCookies();
          } catch (error) {
            return Promise.reject(error);
          }
        }
      };
      CapacitorCookies = registerPlugin("CapacitorCookies", {
        web: () => new CapacitorCookiesPluginWeb()
      });
      readBlobAsBase64 = async (blob) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const base64String = reader.result;
          resolve(base64String.indexOf(",") >= 0 ? base64String.split(",")[1] : base64String);
        };
        reader.onerror = (error) => reject(error);
        reader.readAsDataURL(blob);
      });
      normalizeHttpHeaders = (headers = {}) => {
        const originalKeys = Object.keys(headers);
        const loweredKeys = Object.keys(headers).map((k) => k.toLocaleLowerCase());
        const normalized = loweredKeys.reduce((acc, key, index) => {
          acc[key] = headers[originalKeys[index]];
          return acc;
        }, {});
        return normalized;
      };
      buildUrlParams = (params, shouldEncode = true) => {
        if (!params)
          return null;
        const output = Object.entries(params).reduce((accumulator, entry) => {
          const [key, value] = entry;
          let encodedValue;
          let item;
          if (Array.isArray(value)) {
            item = "";
            value.forEach((str) => {
              encodedValue = shouldEncode ? encodeURIComponent(str) : str;
              item += `${key}=${encodedValue}&`;
            });
            item.slice(0, -1);
          } else {
            encodedValue = shouldEncode ? encodeURIComponent(value) : value;
            item = `${key}=${encodedValue}`;
          }
          return `${accumulator}&${item}`;
        }, "");
        return output.substr(1);
      };
      buildRequestInit = (options, extra = {}) => {
        const output = Object.assign({ method: options.method || "GET", headers: options.headers }, extra);
        const headers = normalizeHttpHeaders(options.headers);
        const type = headers["content-type"] || "";
        if (typeof options.data === "string") {
          output.body = options.data;
        } else if (type.includes("application/x-www-form-urlencoded")) {
          const params = new URLSearchParams();
          for (const [key, value] of Object.entries(options.data || {})) {
            params.set(key, value);
          }
          output.body = params.toString();
        } else if (type.includes("multipart/form-data") || options.data instanceof FormData) {
          const form = new FormData();
          if (options.data instanceof FormData) {
            options.data.forEach((value, key) => {
              form.append(key, value);
            });
          } else {
            for (const key of Object.keys(options.data)) {
              form.append(key, options.data[key]);
            }
          }
          output.body = form;
          const headers2 = new Headers(output.headers);
          headers2.delete("content-type");
          output.headers = headers2;
        } else if (type.includes("application/json") || typeof options.data === "object") {
          output.body = JSON.stringify(options.data);
        }
        return output;
      };
      CapacitorHttpPluginWeb = class extends WebPlugin {
        /**
         * Perform an Http request given a set of options
         * @param options Options to build the HTTP request
         */
        async request(options) {
          const requestInit = buildRequestInit(options, options.webFetchExtra);
          const urlParams = buildUrlParams(options.params, options.shouldEncodeUrlParams);
          const url = urlParams ? `${options.url}?${urlParams}` : options.url;
          const response = await fetch(url, requestInit);
          const contentType = response.headers.get("content-type") || "";
          let { responseType = "text" } = response.ok ? options : {};
          if (contentType.includes("application/json")) {
            responseType = "json";
          }
          let data;
          let blob;
          switch (responseType) {
            case "arraybuffer":
            case "blob":
              blob = await response.blob();
              data = await readBlobAsBase64(blob);
              break;
            case "json":
              data = await response.json();
              break;
            case "document":
            case "text":
            default:
              data = await response.text();
          }
          const headers = {};
          response.headers.forEach((value, key) => {
            headers[key] = value;
          });
          return {
            data,
            headers,
            status: response.status,
            url: response.url
          };
        }
        /**
         * Perform an Http GET request given a set of options
         * @param options Options to build the HTTP request
         */
        async get(options) {
          return this.request(Object.assign(Object.assign({}, options), { method: "GET" }));
        }
        /**
         * Perform an Http POST request given a set of options
         * @param options Options to build the HTTP request
         */
        async post(options) {
          return this.request(Object.assign(Object.assign({}, options), { method: "POST" }));
        }
        /**
         * Perform an Http PUT request given a set of options
         * @param options Options to build the HTTP request
         */
        async put(options) {
          return this.request(Object.assign(Object.assign({}, options), { method: "PUT" }));
        }
        /**
         * Perform an Http PATCH request given a set of options
         * @param options Options to build the HTTP request
         */
        async patch(options) {
          return this.request(Object.assign(Object.assign({}, options), { method: "PATCH" }));
        }
        /**
         * Perform an Http DELETE request given a set of options
         * @param options Options to build the HTTP request
         */
        async delete(options) {
          return this.request(Object.assign(Object.assign({}, options), { method: "DELETE" }));
        }
      };
      CapacitorHttp = registerPlugin("CapacitorHttp", {
        web: () => new CapacitorHttpPluginWeb()
      });
    }
  });

  // node_modules/@capacitor-firebase/authentication/dist/esm/definitions.js
  var Persistence, ProviderId;
  var init_definitions = __esm({
    "node_modules/@capacitor-firebase/authentication/dist/esm/definitions.js"() {
      (function(Persistence2) {
        Persistence2["IndexedDbLocal"] = "INDEXED_DB_LOCAL";
        Persistence2["InMemory"] = "IN_MEMORY";
        Persistence2["BrowserLocal"] = "BROWSER_LOCAL";
        Persistence2["BrowserSession"] = "BROWSER_SESSION";
      })(Persistence || (Persistence = {}));
      (function(ProviderId2) {
        ProviderId2["APPLE"] = "apple.com";
        ProviderId2["FACEBOOK"] = "facebook.com";
        ProviderId2["GAME_CENTER"] = "gc.apple.com";
        ProviderId2["GITHUB"] = "github.com";
        ProviderId2["GOOGLE"] = "google.com";
        ProviderId2["MICROSOFT"] = "microsoft.com";
        ProviderId2["PLAY_GAMES"] = "playgames.google.com";
        ProviderId2["TWITTER"] = "twitter.com";
        ProviderId2["YAHOO"] = "yahoo.com";
        ProviderId2["PASSWORD"] = "password";
        ProviderId2["PHONE"] = "phone";
      })(ProviderId || (ProviderId = {}));
    }
  });

  // node_modules/@capacitor-firebase/authentication/dist/esm/web.js
  var web_exports = {};
  __export(web_exports, {
    FirebaseAuthenticationWeb: () => FirebaseAuthenticationWeb
  });
  var import_auth, FirebaseAuthenticationWeb;
  var init_web = __esm({
    "node_modules/@capacitor-firebase/authentication/dist/esm/web.js"() {
      init_dist();
      import_auth = __require("firebase/auth");
      init_definitions();
      FirebaseAuthenticationWeb = class _FirebaseAuthenticationWeb extends WebPlugin {
        constructor() {
          super();
          this.lastConfirmationResult = /* @__PURE__ */ new Map();
          const auth = (0, import_auth.getAuth)();
          auth.onAuthStateChanged((user) => this.handleAuthStateChange(user));
          auth.onIdTokenChanged((user) => void this.handleIdTokenChange(user));
        }
        async applyActionCode(options) {
          const auth = (0, import_auth.getAuth)();
          return (0, import_auth.applyActionCode)(auth, options.oobCode);
        }
        async createUserWithEmailAndPassword(options) {
          const auth = (0, import_auth.getAuth)();
          const userCredential = await (0, import_auth.createUserWithEmailAndPassword)(auth, options.email, options.password);
          return this.createSignInResult(userCredential, null);
        }
        async confirmPasswordReset(options) {
          const auth = (0, import_auth.getAuth)();
          return (0, import_auth.confirmPasswordReset)(auth, options.oobCode, options.newPassword);
        }
        async confirmVerificationCode(options) {
          const { verificationCode, verificationId } = options;
          const confirmationResult = this.lastConfirmationResult.get(verificationId);
          if (!confirmationResult) {
            throw new Error(_FirebaseAuthenticationWeb.ERROR_CONFIRMATION_RESULT_MISSING);
          }
          const userCredential = await confirmationResult.confirm(verificationCode);
          return this.createSignInResult(userCredential, null);
        }
        async deleteUser() {
          const auth = (0, import_auth.getAuth)();
          const currentUser = auth.currentUser;
          if (!currentUser) {
            throw new Error(_FirebaseAuthenticationWeb.ERROR_NO_USER_SIGNED_IN);
          }
          return (0, import_auth.deleteUser)(currentUser);
        }
        async fetchSignInMethodsForEmail(options) {
          const auth = (0, import_auth.getAuth)();
          const signInMethods = await (0, import_auth.fetchSignInMethodsForEmail)(auth, options.email);
          return {
            signInMethods
          };
        }
        async getPendingAuthResult() {
          this.throwNotAvailableError();
        }
        async getCurrentUser() {
          const auth = (0, import_auth.getAuth)();
          const userResult = this.createUserResult(auth.currentUser);
          const result = {
            user: userResult
          };
          return result;
        }
        async getIdToken(options) {
          const auth = (0, import_auth.getAuth)();
          if (!auth.currentUser) {
            throw new Error(_FirebaseAuthenticationWeb.ERROR_NO_USER_SIGNED_IN);
          }
          const idToken = await auth.currentUser.getIdToken(options === null || options === void 0 ? void 0 : options.forceRefresh);
          const result = {
            token: idToken || ""
          };
          return result;
        }
        async getRedirectResult() {
          const auth = (0, import_auth.getAuth)();
          const userCredential = await (0, import_auth.getRedirectResult)(auth);
          const authCredential = userCredential ? import_auth.OAuthProvider.credentialFromResult(userCredential) : null;
          return this.createSignInResult(userCredential, authCredential);
        }
        async getTenantId() {
          const auth = (0, import_auth.getAuth)();
          return {
            tenantId: auth.tenantId
          };
        }
        async isSignInWithEmailLink(options) {
          const auth = (0, import_auth.getAuth)();
          return {
            isSignInWithEmailLink: (0, import_auth.isSignInWithEmailLink)(auth, options.emailLink)
          };
        }
        async linkWithApple(options) {
          const provider = new import_auth.OAuthProvider(ProviderId.APPLE);
          this.applySignInOptions(options || {}, provider);
          const userCredential = await this.linkCurrentUserWithPopupOrRedirect(provider, options === null || options === void 0 ? void 0 : options.mode);
          const authCredential = import_auth.OAuthProvider.credentialFromResult(userCredential);
          return this.createSignInResult(userCredential, authCredential);
        }
        async linkWithEmailAndPassword(options) {
          const authCredential = import_auth.EmailAuthProvider.credential(options.email, options.password);
          const userCredential = await this.linkCurrentUserWithCredential(authCredential);
          return this.createSignInResult(userCredential, authCredential);
        }
        async linkWithEmailLink(options) {
          const authCredential = import_auth.EmailAuthProvider.credentialWithLink(options.email, options.emailLink);
          const userCredential = await this.linkCurrentUserWithCredential(authCredential);
          return this.createSignInResult(userCredential, authCredential);
        }
        async linkWithFacebook(options) {
          const provider = new import_auth.FacebookAuthProvider();
          this.applySignInOptions(options || {}, provider);
          const userCredential = await this.linkCurrentUserWithPopupOrRedirect(provider, options === null || options === void 0 ? void 0 : options.mode);
          const authCredential = import_auth.FacebookAuthProvider.credentialFromResult(userCredential);
          return this.createSignInResult(userCredential, authCredential);
        }
        async linkWithGameCenter() {
          this.throwNotAvailableError();
        }
        async linkWithGithub(options) {
          const provider = new import_auth.GithubAuthProvider();
          this.applySignInOptions(options || {}, provider);
          const userCredential = await this.linkCurrentUserWithPopupOrRedirect(provider, options === null || options === void 0 ? void 0 : options.mode);
          const authCredential = import_auth.GithubAuthProvider.credentialFromResult(userCredential);
          return this.createSignInResult(userCredential, authCredential);
        }
        async linkWithGoogle(options) {
          const provider = new import_auth.GoogleAuthProvider();
          this.applySignInOptions(options || {}, provider);
          const userCredential = await this.linkCurrentUserWithPopupOrRedirect(provider, options === null || options === void 0 ? void 0 : options.mode);
          const authCredential = import_auth.GoogleAuthProvider.credentialFromResult(userCredential);
          return this.createSignInResult(userCredential, authCredential);
        }
        async linkWithMicrosoft(options) {
          const provider = new import_auth.OAuthProvider(ProviderId.MICROSOFT);
          this.applySignInOptions(options || {}, provider);
          const userCredential = await this.linkCurrentUserWithPopupOrRedirect(provider, options === null || options === void 0 ? void 0 : options.mode);
          const authCredential = import_auth.OAuthProvider.credentialFromResult(userCredential);
          return this.createSignInResult(userCredential, authCredential);
        }
        async linkWithOpenIdConnect(options) {
          const provider = new import_auth.OAuthProvider(options.providerId);
          this.applySignInOptions(options, provider);
          const userCredential = await this.linkCurrentUserWithPopupOrRedirect(provider, options.mode);
          const authCredential = import_auth.OAuthProvider.credentialFromResult(userCredential);
          return this.createSignInResult(userCredential, authCredential);
        }
        async linkWithPhoneNumber(options) {
          const auth = (0, import_auth.getAuth)();
          const currentUser = auth.currentUser;
          if (!currentUser) {
            throw new Error(_FirebaseAuthenticationWeb.ERROR_NO_USER_SIGNED_IN);
          }
          if (!options.phoneNumber) {
            throw new Error(_FirebaseAuthenticationWeb.ERROR_PHONE_NUMBER_MISSING);
          }
          if (!options.recaptchaVerifier || !(options.recaptchaVerifier instanceof import_auth.RecaptchaVerifier)) {
            throw new Error(_FirebaseAuthenticationWeb.ERROR_RECAPTCHA_VERIFIER_MISSING);
          }
          try {
            const confirmationResult = await (0, import_auth.linkWithPhoneNumber)(currentUser, options.phoneNumber, options.recaptchaVerifier);
            const { verificationId } = confirmationResult;
            this.lastConfirmationResult.set(verificationId, confirmationResult);
            const event = {
              verificationId
            };
            this.notifyListeners(_FirebaseAuthenticationWeb.PHONE_CODE_SENT_EVENT, event);
          } catch (error) {
            const event = {
              message: this.getErrorMessage(error)
            };
            this.notifyListeners(_FirebaseAuthenticationWeb.PHONE_VERIFICATION_FAILED_EVENT, event);
          }
        }
        async linkWithPlayGames() {
          this.throwNotAvailableError();
        }
        async linkWithTwitter(options) {
          const provider = new import_auth.TwitterAuthProvider();
          this.applySignInOptions(options || {}, provider);
          const userCredential = await this.linkCurrentUserWithPopupOrRedirect(provider, options === null || options === void 0 ? void 0 : options.mode);
          const authCredential = import_auth.TwitterAuthProvider.credentialFromResult(userCredential);
          return this.createSignInResult(userCredential, authCredential);
        }
        async linkWithYahoo(options) {
          const provider = new import_auth.OAuthProvider(ProviderId.YAHOO);
          this.applySignInOptions(options || {}, provider);
          const userCredential = await this.linkCurrentUserWithPopupOrRedirect(provider, options === null || options === void 0 ? void 0 : options.mode);
          const authCredential = import_auth.OAuthProvider.credentialFromResult(userCredential);
          return this.createSignInResult(userCredential, authCredential);
        }
        async reload() {
          const auth = (0, import_auth.getAuth)();
          const currentUser = auth.currentUser;
          if (!currentUser) {
            throw new Error(_FirebaseAuthenticationWeb.ERROR_NO_USER_SIGNED_IN);
          }
          return (0, import_auth.reload)(currentUser);
        }
        async revokeAccessToken(options) {
          const auth = (0, import_auth.getAuth)();
          return (0, import_auth.revokeAccessToken)(auth, options.token);
        }
        async sendEmailVerification(options) {
          const auth = (0, import_auth.getAuth)();
          const currentUser = auth.currentUser;
          if (!currentUser) {
            throw new Error(_FirebaseAuthenticationWeb.ERROR_NO_USER_SIGNED_IN);
          }
          return (0, import_auth.sendEmailVerification)(currentUser, options === null || options === void 0 ? void 0 : options.actionCodeSettings);
        }
        async sendPasswordResetEmail(options) {
          const auth = (0, import_auth.getAuth)();
          return (0, import_auth.sendPasswordResetEmail)(auth, options.email, options.actionCodeSettings);
        }
        async sendSignInLinkToEmail(options) {
          const auth = (0, import_auth.getAuth)();
          return (0, import_auth.sendSignInLinkToEmail)(auth, options.email, options.actionCodeSettings);
        }
        async setLanguageCode(options) {
          const auth = (0, import_auth.getAuth)();
          auth.languageCode = options.languageCode;
        }
        async setPersistence(options) {
          const auth = (0, import_auth.getAuth)();
          switch (options.persistence) {
            case Persistence.BrowserLocal:
              await (0, import_auth.setPersistence)(auth, import_auth.browserLocalPersistence);
              break;
            case Persistence.BrowserSession:
              await (0, import_auth.setPersistence)(auth, import_auth.browserSessionPersistence);
              break;
            case Persistence.IndexedDbLocal:
              await (0, import_auth.setPersistence)(auth, import_auth.indexedDBLocalPersistence);
              break;
            case Persistence.InMemory:
              await (0, import_auth.setPersistence)(auth, import_auth.inMemoryPersistence);
              break;
          }
        }
        async setTenantId(options) {
          const auth = (0, import_auth.getAuth)();
          auth.tenantId = options.tenantId;
        }
        async signInAnonymously() {
          const auth = (0, import_auth.getAuth)();
          const userCredential = await (0, import_auth.signInAnonymously)(auth);
          return this.createSignInResult(userCredential, null);
        }
        async signInWithApple(options) {
          const provider = new import_auth.OAuthProvider(ProviderId.APPLE);
          this.applySignInOptions(options || {}, provider);
          const userCredential = await this.signInWithPopupOrRedirect(provider, options === null || options === void 0 ? void 0 : options.mode);
          const authCredential = import_auth.OAuthProvider.credentialFromResult(userCredential);
          return this.createSignInResult(userCredential, authCredential);
        }
        async signInWithCustomToken(options) {
          const auth = (0, import_auth.getAuth)();
          const userCredential = await (0, import_auth.signInWithCustomToken)(auth, options.token);
          return this.createSignInResult(userCredential, null);
        }
        async signInWithEmailAndPassword(options) {
          const auth = (0, import_auth.getAuth)();
          const userCredential = await (0, import_auth.signInWithEmailAndPassword)(auth, options.email, options.password);
          return this.createSignInResult(userCredential, null);
        }
        async signInWithEmailLink(options) {
          const auth = (0, import_auth.getAuth)();
          const userCredential = await (0, import_auth.signInWithEmailLink)(auth, options.email, options.emailLink);
          return this.createSignInResult(userCredential, null);
        }
        async signInWithFacebook(options) {
          const provider = new import_auth.FacebookAuthProvider();
          this.applySignInOptions(options || {}, provider);
          const userCredential = await this.signInWithPopupOrRedirect(provider, options === null || options === void 0 ? void 0 : options.mode);
          const authCredential = import_auth.FacebookAuthProvider.credentialFromResult(userCredential);
          return this.createSignInResult(userCredential, authCredential);
        }
        async signInWithGithub(options) {
          const provider = new import_auth.GithubAuthProvider();
          this.applySignInOptions(options || {}, provider);
          const userCredential = await this.signInWithPopupOrRedirect(provider, options === null || options === void 0 ? void 0 : options.mode);
          const authCredential = import_auth.GithubAuthProvider.credentialFromResult(userCredential);
          return this.createSignInResult(userCredential, authCredential);
        }
        async signInWithGoogle(options) {
          const provider = new import_auth.GoogleAuthProvider();
          this.applySignInOptions(options || {}, provider);
          const userCredential = await this.signInWithPopupOrRedirect(provider, options === null || options === void 0 ? void 0 : options.mode);
          const authCredential = import_auth.GoogleAuthProvider.credentialFromResult(userCredential);
          return this.createSignInResult(userCredential, authCredential);
        }
        async signInWithMicrosoft(options) {
          const provider = new import_auth.OAuthProvider(ProviderId.MICROSOFT);
          this.applySignInOptions(options || {}, provider);
          const userCredential = await this.signInWithPopupOrRedirect(provider, options === null || options === void 0 ? void 0 : options.mode);
          const authCredential = import_auth.OAuthProvider.credentialFromResult(userCredential);
          return this.createSignInResult(userCredential, authCredential);
        }
        async signInWithOpenIdConnect(options) {
          const provider = new import_auth.OAuthProvider(options.providerId);
          this.applySignInOptions(options, provider);
          const userCredential = await this.signInWithPopupOrRedirect(provider, options.mode);
          const authCredential = import_auth.OAuthProvider.credentialFromResult(userCredential);
          return this.createSignInResult(userCredential, authCredential);
        }
        async signInWithPhoneNumber(options) {
          if (!options.phoneNumber) {
            throw new Error(_FirebaseAuthenticationWeb.ERROR_PHONE_NUMBER_MISSING);
          }
          if (!options.recaptchaVerifier || !(options.recaptchaVerifier instanceof import_auth.RecaptchaVerifier)) {
            throw new Error(_FirebaseAuthenticationWeb.ERROR_RECAPTCHA_VERIFIER_MISSING);
          }
          const auth = (0, import_auth.getAuth)();
          try {
            const confirmationResult = await (0, import_auth.signInWithPhoneNumber)(auth, options.phoneNumber, options.recaptchaVerifier);
            const { verificationId } = confirmationResult;
            this.lastConfirmationResult.set(verificationId, confirmationResult);
            const event = {
              verificationId
            };
            this.notifyListeners(_FirebaseAuthenticationWeb.PHONE_CODE_SENT_EVENT, event);
          } catch (error) {
            const event = {
              message: this.getErrorMessage(error)
            };
            this.notifyListeners(_FirebaseAuthenticationWeb.PHONE_VERIFICATION_FAILED_EVENT, event);
          }
        }
        async signInWithPlayGames() {
          this.throwNotAvailableError();
        }
        async signInWithGameCenter() {
          this.throwNotAvailableError();
        }
        async signInWithTwitter(options) {
          const provider = new import_auth.TwitterAuthProvider();
          this.applySignInOptions(options || {}, provider);
          const userCredential = await this.signInWithPopupOrRedirect(provider, options === null || options === void 0 ? void 0 : options.mode);
          const authCredential = import_auth.TwitterAuthProvider.credentialFromResult(userCredential);
          return this.createSignInResult(userCredential, authCredential);
        }
        async signInWithYahoo(options) {
          const provider = new import_auth.OAuthProvider(ProviderId.YAHOO);
          this.applySignInOptions(options || {}, provider);
          const userCredential = await this.signInWithPopupOrRedirect(provider, options === null || options === void 0 ? void 0 : options.mode);
          const authCredential = import_auth.OAuthProvider.credentialFromResult(userCredential);
          return this.createSignInResult(userCredential, authCredential);
        }
        async signOut() {
          const auth = (0, import_auth.getAuth)();
          await auth.signOut();
        }
        async unlink(options) {
          const auth = (0, import_auth.getAuth)();
          if (!auth.currentUser) {
            throw new Error(_FirebaseAuthenticationWeb.ERROR_NO_USER_SIGNED_IN);
          }
          const user = await (0, import_auth.unlink)(auth.currentUser, options.providerId);
          const userResult = this.createUserResult(user);
          const result = {
            user: userResult
          };
          return result;
        }
        async updateEmail(options) {
          const auth = (0, import_auth.getAuth)();
          const currentUser = auth.currentUser;
          if (!currentUser) {
            throw new Error(_FirebaseAuthenticationWeb.ERROR_NO_USER_SIGNED_IN);
          }
          return (0, import_auth.updateEmail)(currentUser, options.newEmail);
        }
        async updatePassword(options) {
          const auth = (0, import_auth.getAuth)();
          const currentUser = auth.currentUser;
          if (!currentUser) {
            throw new Error(_FirebaseAuthenticationWeb.ERROR_NO_USER_SIGNED_IN);
          }
          return (0, import_auth.updatePassword)(currentUser, options.newPassword);
        }
        async updateProfile(options) {
          const auth = (0, import_auth.getAuth)();
          const currentUser = auth.currentUser;
          if (!currentUser) {
            throw new Error(_FirebaseAuthenticationWeb.ERROR_NO_USER_SIGNED_IN);
          }
          return (0, import_auth.updateProfile)(currentUser, {
            displayName: options.displayName,
            photoURL: options.photoUrl
          });
        }
        async useAppLanguage() {
          const auth = (0, import_auth.getAuth)();
          auth.useDeviceLanguage();
        }
        async useEmulator(options) {
          const auth = (0, import_auth.getAuth)();
          const port = options.port || 9099;
          const scheme = options.scheme || "http";
          if (options.host.includes("://")) {
            (0, import_auth.connectAuthEmulator)(auth, `${options.host}:${port}`);
          } else {
            (0, import_auth.connectAuthEmulator)(auth, `${scheme}://${options.host}:${port}`);
          }
        }
        async verifyBeforeUpdateEmail(options) {
          const auth = (0, import_auth.getAuth)();
          const currentUser = auth.currentUser;
          if (!currentUser) {
            throw new Error(_FirebaseAuthenticationWeb.ERROR_NO_USER_SIGNED_IN);
          }
          return (0, import_auth.verifyBeforeUpdateEmail)(currentUser, options === null || options === void 0 ? void 0 : options.newEmail, options === null || options === void 0 ? void 0 : options.actionCodeSettings);
        }
        handleAuthStateChange(user) {
          const userResult = this.createUserResult(user);
          const change = {
            user: userResult
          };
          this.notifyListeners(_FirebaseAuthenticationWeb.AUTH_STATE_CHANGE_EVENT, change, true);
        }
        async handleIdTokenChange(user) {
          if (!user) {
            return;
          }
          const idToken = await user.getIdToken(false);
          const result = {
            token: idToken
          };
          this.notifyListeners(_FirebaseAuthenticationWeb.ID_TOKEN_CHANGE_EVENT, result, true);
        }
        applySignInOptions(options, provider) {
          if (options.customParameters) {
            const customParameters = {};
            options.customParameters.map((parameter) => {
              customParameters[parameter.key] = parameter.value;
            });
            provider.setCustomParameters(customParameters);
          }
          if (options.scopes) {
            for (const scope of options.scopes) {
              provider.addScope(scope);
            }
          }
        }
        signInWithPopupOrRedirect(provider, mode) {
          const auth = (0, import_auth.getAuth)();
          if (mode === "redirect") {
            return (0, import_auth.signInWithRedirect)(auth, provider);
          } else {
            return (0, import_auth.signInWithPopup)(auth, provider);
          }
        }
        linkCurrentUserWithPopupOrRedirect(provider, mode) {
          const auth = (0, import_auth.getAuth)();
          if (!auth.currentUser) {
            throw new Error(_FirebaseAuthenticationWeb.ERROR_NO_USER_SIGNED_IN);
          }
          if (mode === "redirect") {
            return (0, import_auth.linkWithRedirect)(auth.currentUser, provider);
          } else {
            return (0, import_auth.linkWithPopup)(auth.currentUser, provider);
          }
        }
        linkCurrentUserWithCredential(credential) {
          const auth = (0, import_auth.getAuth)();
          if (!auth.currentUser) {
            throw new Error(_FirebaseAuthenticationWeb.ERROR_NO_USER_SIGNED_IN);
          }
          return (0, import_auth.linkWithCredential)(auth.currentUser, credential);
        }
        createSignInResult(userCredential, authCredential) {
          const userResult = this.createUserResult((userCredential === null || userCredential === void 0 ? void 0 : userCredential.user) || null);
          const credentialResult = this.createCredentialResult(authCredential);
          const additionalUserInfoResult = this.createAdditionalUserInfoResult(userCredential);
          const result = {
            user: userResult,
            credential: credentialResult,
            additionalUserInfo: additionalUserInfoResult
          };
          return result;
        }
        createCredentialResult(credential) {
          if (!credential) {
            return null;
          }
          const result = {
            providerId: credential.providerId
          };
          if (credential instanceof import_auth.OAuthCredential) {
            result.accessToken = credential.accessToken;
            result.idToken = credential.idToken;
            result.secret = credential.secret;
          }
          return result;
        }
        createUserResult(user) {
          if (!user) {
            return null;
          }
          const result = {
            displayName: user.displayName,
            email: user.email,
            emailVerified: user.emailVerified,
            isAnonymous: user.isAnonymous,
            metadata: this.createUserMetadataResult(user.metadata),
            phoneNumber: user.phoneNumber,
            photoUrl: user.photoURL,
            providerData: this.createUserProviderDataResult(user.providerData),
            providerId: user.providerId,
            tenantId: user.tenantId,
            uid: user.uid
          };
          return result;
        }
        createUserMetadataResult(metadata) {
          const result = {};
          if (metadata.creationTime) {
            result.creationTime = Date.parse(metadata.creationTime);
          }
          if (metadata.lastSignInTime) {
            result.lastSignInTime = Date.parse(metadata.lastSignInTime);
          }
          return result;
        }
        createUserProviderDataResult(providerData) {
          return providerData.map((data) => ({
            displayName: data.displayName,
            email: data.email,
            phoneNumber: data.phoneNumber,
            photoUrl: data.photoURL,
            providerId: data.providerId,
            uid: data.uid
          }));
        }
        createAdditionalUserInfoResult(credential) {
          if (!credential) {
            return null;
          }
          const additionalUserInfo = (0, import_auth.getAdditionalUserInfo)(credential);
          if (!additionalUserInfo) {
            return null;
          }
          const { isNewUser, profile, providerId, username } = additionalUserInfo;
          const result = {
            isNewUser
          };
          if (providerId !== null) {
            result.providerId = providerId;
          }
          if (profile !== null) {
            result.profile = profile;
          }
          if (username !== null && username !== void 0) {
            result.username = username;
          }
          return result;
        }
        getErrorMessage(error) {
          if (error instanceof Object && "message" in error && typeof error["message"] === "string") {
            return error["message"];
          }
          return JSON.stringify(error);
        }
        throwNotAvailableError() {
          throw new Error("Not available on web.");
        }
      };
      FirebaseAuthenticationWeb.AUTH_STATE_CHANGE_EVENT = "authStateChange";
      FirebaseAuthenticationWeb.ID_TOKEN_CHANGE_EVENT = "idTokenChange";
      FirebaseAuthenticationWeb.PHONE_CODE_SENT_EVENT = "phoneCodeSent";
      FirebaseAuthenticationWeb.PHONE_VERIFICATION_FAILED_EVENT = "phoneVerificationFailed";
      FirebaseAuthenticationWeb.ERROR_NO_USER_SIGNED_IN = "No user is signed in.";
      FirebaseAuthenticationWeb.ERROR_PHONE_NUMBER_MISSING = "phoneNumber must be provided.";
      FirebaseAuthenticationWeb.ERROR_RECAPTCHA_VERIFIER_MISSING = "recaptchaVerifier must be provided and must be an instance of RecaptchaVerifier.";
      FirebaseAuthenticationWeb.ERROR_CONFIRMATION_RESULT_MISSING = "No confirmation result with this verification id was found.";
    }
  });

  // src/native/firebase-auth-native.js
  init_dist();

  // node_modules/@capacitor-firebase/authentication/dist/esm/index.js
  init_dist();
  init_definitions();
  var FirebaseAuthentication = registerPlugin("FirebaseAuthentication", {
    web: () => Promise.resolve().then(() => (init_web(), web_exports)).then((m) => new m.FirebaseAuthenticationWeb())
  });

  // src/native/firebase-auth-native.js
  function isNative() {
    return Capacitor.isNativePlatform();
  }
  async function signInWithGoogle() {
    const result = await FirebaseAuthentication.signInWithGoogle();
    const idToken = result && result.credential && result.credential.idToken;
    if (!idToken) throw new Error("[firebase-auth-native] no idToken returned from native Google sign-in");
    return idToken;
  }
  async function signOut() {
    try {
      await FirebaseAuthentication.signOut();
    } catch (err) {
      console.warn("[firebase-auth-native] native sign-out failed", err);
    }
  }
  window.trtNativeAuth = { isNative, signInWithGoogle, signOut };
})();
/*! Bundled license information:

@capacitor/core/dist/index.js:
  (*! Capacitor: https://capacitorjs.com/ - MIT License *)
*/
