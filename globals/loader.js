/*
 * Copyright 2000-2020 Sergio Rando <segio.rando@yahoo.com>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *		http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

import { getTickCounter } from "./../../../include/time.js"
import { unbindEvent, bindEvent } from "./../../../include/event.js"
import { URI } from "./../../../include/uri.js"
import { VOLUME_MIN } from "./../../js-mixer/modules/sound.js"
import { HSIA2RGBA, MorphRGBA, RGBA2STR } from "./../../js-color/modules/color.js"
import { MessagePool } from "./../../js-message/globals/message.js"
import { Gallery } from "./../../js-gallery/globals/gallery.js"
import { Mixer } from "./../../js-mixer/globals/mixer.js"

export const evUserInteraction = 'evUserInteraction';

const LOADER_SPEED = 10;

/** @enum {string} */
const LoaderSupportedType = {
    IMAGE: "image",
    SOUND: "sound",
    JSON: "json",
    TEXT: "text",
    DATA: "data",
};

/** @typedef {Object<string, Array<string>>} LoaderSupportedTypes */
var LoaderSupportedTypes;

/** @type {LoaderSupportedTypes} */
const supportedTypes = {
    [LoaderSupportedType.IMAGE]: [".png", ".jpg", ".jpeg", ".gif", ".svg"],
    [LoaderSupportedType.SOUND]: [".mp3", ".ogg", ".snd"],
    [LoaderSupportedType.JSON]: [".json"],
    [LoaderSupportedType.TEXT]: [".txt"],
};

/** @enum {string} */
const LoaderResponseType = {
    BLOB: "arraybuffer",
    TEXT: "text",
    JSON: "json",
};

/** @typedef {Object<string, Array<string>>} LoaderResponseTypes */
var LoaderResponseTypes;

/** @type {LoaderResponseTypes} */
const responseTypes = {
    [LoaderResponseType.BLOB]: [".bin"],
    [LoaderResponseType.TEXT]: [".txt"],
    [LoaderResponseType.JSON]: [".json"],
};

/** @typedef {{
	uTotal: number,
	uComplete: number,
	uError: number
}} LoaderStatus */
var LoaderStatus;

/**
 * @param {string} sEXT
 * @returns {LoaderSupportedType}
 */
function typeOf(sEXT) {
    for (var i in supportedTypes) {
        if (supportedTypes[i].indexOf(sEXT) != -1)
            return /** @type {LoaderSupportedType} */ (i);
    }
    return LoaderSupportedType.DATA;
}

/**
 * @param {string} sEXT 
 * @returns {LoaderResponseType}
 */
function responseTypeOf(sEXT) {
    for (var i in responseTypes) {
        if (responseTypes[i].indexOf(sEXT) != -1)
            return /** @type {LoaderResponseType} */ (i);
    }
    return LoaderResponseType.TEXT;
}

/** @abstract */
class CacheItem {
    /**
     * @param {LoaderImpl} oLoader
     * @param {string | null} sGroup 
     * @param {string} sKey 
     * @param {string} sPath 
     * @param {string} sType 
     * @param {Function | null} fnCallback
     */
    constructor(oLoader, sGroup, sKey, sPath, sType, fnCallback) {
        this.oLoader = oLoader;
        this.sGroup = sGroup;
        this.sKey = sKey;
        this.sPath = sPath;
        this.sType = sType;

        this.fnCallback = fnCallback;

        /** @type {boolean} */
        this.bReady;
        this.idRepeat = null;
        this.iRepeat = -1; // Infinite
        this.uRetry = 0;
        this.uNext = 0;
    }

    /** @abstract */
    create() {}

    /** @abstract */
    cancel() {}

    /** @abstract */
    release() {}
}

/**
 * @extends {HTMLImageElement}
 */
class HTMLImageElementEx {
    constructor() {
        /** @type {Function} */
        this.evLoad;
        /** @type {Function} */
        this.evError;
        /** @type {Function} */
        this.release;

        let domImage = /** @type {!HTMLImageElementEx} */ (document.createElement('img'));

        return domImage;
    }
}

class CacheImage extends CacheItem {
    /**
     * @param {LoaderImpl} oLoader
     * @param {string | null} sGroup 
     * @param {string} sKey 
     * @param {string} sPath 
     * @param {Function | null} fnCallback
     */
    constructor(oLoader, sGroup, sKey, sPath, fnCallback) {
        super(oLoader, sGroup, sKey, sPath, LoaderSupportedType.IMAGE, fnCallback);

        /** @type {HTMLImageElementEx} */
        this.domImage = null;
    }

    /** @private */
    bind() {
        this.domImage.evLoad = CacheImage.prototype.evLoad.bind(this);
        this.domImage.evError = CacheImage.prototype.evError.bind(this);
        this.domImage.release = CacheImage.prototype.release.bind(this);

        bindEvent(this.domImage, 'load', this.domImage.evLoad);
        bindEvent(this.domImage, 'error', this.domImage.evError);
    }

    /** @private */
    unbind() {
        if (this.domImage === null)
            return;

        unbindEvent(this.domImage, 'load', this.domImage.evLoad);
        unbindEvent(this.domImage, 'error', this.domImage.evError);

        delete this.domImage.evLoad;
        delete this.domImage.evError;
        delete this.domImage.release;
    }

    create() {
        if (this.domImage !== null)
            return;

        this.bReady = false;
        this.domImage = new HTMLImageElementEx();

        this.bind();

        this.oLoader.oCore.oGalery.register(this.domImage);

        this.domImage.src = this.sPath;
    }

    cancel() {
        if (this.idRepeat !== null) {
            clearTimeout(this.idRepeat);
            this.idRepeat = null;
        }

        if (this.domImage === null)
            return;

        this.oLoader.oCore.oGalery.unregister(this.domImage);
        this.unbind();

        if (this.bReady) {
            this.bReady = false;
            this.oLoader.oCore.oGalery.remove(this.sKey);
            this.oLoader.uncache(this);
        }

        this.domImage = null;
    }

    release() {
        this.oLoader.oCount.uError -= this.uRetry;
        this.uRetry = 0;

        this.cancel();
    }

    /** @param {*} _event */
    evLoad(_event) {
        this.oLoader.oCount.uError -= this.uRetry;

        this.unbind();
        this.bReady = true;
        this.oLoader.oCore.oGalery.createTextureImage(this.sKey, this.domImage);
        this.oLoader.cache(this);
        this.oLoader.evLoad(this);
        if (this.fnCallback !== null) this.fnCallback(this);
    }

    /** @param {*} _event */
    evError(_event) {
        this.oLoader.oCount.uError++;
        this.oLoader.bStatus = true;

        this.cancel();

        this.uRetry++;
        if ((this.iRepeat < 0) || (this.uRetry <= this.iRepeat)) {
            this.uNext += 3000 + ((Math.random() * 2000) | 0);
            if (this.uNext > 60000) this.uNext = 60000;
            this.idRepeat = setTimeout(this.create.bind(this), this.uNext);
        } else {
            this.oLoader.evError(this);
        }
    }
}

/**
 * @extends {HTMLAudioElement}
 */
class HTMLAudioElementEx {
    constructor() {
        /** @type {Function} */
        this.evLoad;
        /** @type {Function} */
        this.evError;
        /** @type {Function} */
        this.evPause;
        /** @type {Function} */
        this.evDurationChange;
        /** @type {Function} */
        this.evEnded;
        /** @type {Function} */
        this.evCanPlayThrough;
        /** @type {Promise} */
        this.oPromise;
        /** @type {number} */
        this.uPromise;
        /** @type {function(Function=,Function=): Promise} */
        this.requestPlay;
        /** @type {Function} */
        this.requestPause;

        let domAudio = /** @type {HTMLAudioElementEx} */ (window.document.createElement('audio'));

        domAudio.oPromise = null;
        domAudio.uPromise = 0;
        domAudio.requestPlay = HTMLAudioElementEx.requestPlay.bind(domAudio);
        domAudio.requestPause = HTMLAudioElementEx.requestPause.bind(domAudio);

        return domAudio;
    }

    /**
     * @private
     * @this {HTMLAudioElementEx}
     * @param {Function=} fnSuccess
     * @param {Function=} fnFailure
     */
    static async requestPlay(fnSuccess, fnFailure) {
        let THIS = this;
        if (this.uPromise !== 0) {
            this.uPromise++;
            let uCheckPromise = this.uPromise;
            this.oPromise = this.oPromise.then(function() {
                if (THIS.uPromise == uCheckPromise) {
                    THIS.uPromise = 0;
                    THIS.oPromise = null;
                }

                THIS.uPromise++;
                uCheckPromise = THIS.uPromise;
                THIS.oPromise = THIS.play().then(function() {
                        if (THIS.uPromise == uCheckPromise) {
                            THIS.uPromise = 0;
                            THIS.oPromise = null;
                        }

                        if ((fnSuccess !== undefined) && (fnSuccess !== null)) fnSuccess();
                    })
                    .catch(function() {
                        if (THIS.uPromise == uCheckPromise) {
                            THIS.uPromise = 0;
                            THIS.oPromise = null;
                        }

                        if ((fnFailure !== undefined) && (fnFailure !== null)) fnFailure();
                    });
            });
        } else {
            this.uPromise++;
            let uCheckPromise = this.uPromise;
            this.oPromise = this.play().then(function() {
                    if (THIS.uPromise == uCheckPromise) {
                        THIS.uPromise = 0;
                        THIS.oPromise = null;
                    }

                    if ((fnSuccess !== undefined) && (fnSuccess !== null)) fnSuccess();
                })
                .catch(function() {
                    if (THIS.uPromise == uCheckPromise) {
                        THIS.uPromise = 0;
                        THIS.oPromise = null;
                    }

                    if ((fnFailure !== undefined) && (fnFailure !== null)) fnFailure();
                });
        }

        /* DEBUG
        try {
        	await this.play();
        	if ((fnSuccess !== undefined) && (fnSuccess !== null)) fnSuccess();
        } catch (e) {
        	console.log(e);
        	if ((fnFailure !== undefined) && (fnFailure !== null)) fnFailure();
        }
        */
    }

    /**
     * @private
     * @this {HTMLAudioElementEx}
     * @param {Function=} fnCallback
     */
    static requestPause(fnCallback) {
        if (this.uPromise !== 0) {
            let THIS = this;
            this.uPromise++;
            let uCheckPromise = this.uPromise;
            this.oPromise = this.oPromise.then(function() {
                if (THIS.uPromise == uCheckPromise) {
                    THIS.uPromise = 0;
                    THIS.oPromise = null;
                }

                THIS.pause();
                if (fnCallback !== undefined) fnCallback();
            });
        } else {
            this.pause()
            if (fnCallback !== undefined) fnCallback();
        }
    }
}

class CacheSound extends CacheItem {
    /**
     * @param {LoaderImpl} oLoader
     * @param {string | null} sGroup 
     * @param {string} sKey 
     * @param {string} sPath 
     * @param {Function | null} fnCallback
     */
    constructor(oLoader, sGroup, sKey, sPath, fnCallback) {
        super(oLoader, sGroup, sKey, sPath, LoaderSupportedType.SOUND, fnCallback);

        /** @type {HTMLAudioElementEx} */
        this.domAudio = null;
        this.uSource = 0;
        this.uError = 0;

        this.bPlayAgain = false;
        /** @type {Function} */ this.evRequestPlayAgain = CacheSound.prototype.onRequestPlayAgain.bind(this);
        /** @type {Function} */ this.evRequestPlayFailed = CacheSound.prototype.onRequestPlayFailed.bind(this);
    }

    /** @private */
    bind() {
        this.domAudio.evLoad = CacheSound.prototype.evLoad.bind(this);
        this.domAudio.evError = CacheSound.prototype.evError.bind(this);
        this.domAudio.evPause = CacheSound.prototype.evPause.bind(this);
        this.domAudio.evDurationChange = CacheSound.prototype.evDurationChange.bind(this);
        this.domAudio.evEnded = CacheSound.prototype.evEnded.bind(this);
        this.domAudio.evCanPlayThrough = CacheSound.prototype.evCanPlayThrough.bind(this);

        bindEvent(this.domAudio, 'error', this.domAudio.evError);
        bindEvent(this.domAudio, 'pause', this.domAudio.evPause);
        bindEvent(this.domAudio, 'durationchange', this.domAudio.evDurationChange);
        bindEvent(this.domAudio, 'ended', this.domAudio.evEnded);
        bindEvent(this.domAudio, 'canplaythrough', this.domAudio.evCanPlayThrough);
    }

    /** @private */
    unbind() {
		this.bPlayAgain = false;

		if (MessagePool.unregister(evUserInteraction, this.evRequestPlayAgain)) {
            this.oLoader.uErrorUserInteractionCount--;
            if (this.oLoader.uErrorUserInteractionCount === 0) {
                this.oLoader.fErrorUserInteractionTick = getTickCounter();
            }
        }

        if (this.domAudio === null)
            return;

        for (let iIndex = 0; iIndex < this.domAudio.children.length; iIndex++) {
            let domSource = /** @type {HTMLSourceElement} */ (this.domAudio.children[iIndex]);
            unbindEvent(domSource, 'error', this.domAudio.evError);
        }

        unbindEvent(this.domAudio, 'error', this.domAudio.evError);
        unbindEvent(this.domAudio, 'pause', this.domAudio.evPause);
        unbindEvent(this.domAudio, 'durationchange', this.domAudio.evDurationChange);
        unbindEvent(this.domAudio, 'ended', this.domAudio.evEnded);
        unbindEvent(this.domAudio, 'canplaythrough', this.domAudio.evCanPlayThrough);

        delete this.domAudio.evLoad;
        delete this.domAudio.evError;
        delete this.domAudio.evPause;
        delete this.domAudio.evDurationChange;
        delete this.domAudio.evEnded;
        delete this.domAudio.evCanPlayThrough;
    }

    create() {
        if (this.domAudio !== null)
            return;

        this.bReady = false;
        this.domAudio = new HTMLAudioElementEx();

        this.bind();

        this.domAudio.autoplay = false;
        this.domAudio.volume = VOLUME_MIN;
        this.domAudio.preload = "auto";

        let isSND = /\.snd$/i.test(this.sPath);
        let isOGG = /\.ogg$/i.test(this.sPath);
        let isMP3 = /\.mp3$/i.test(this.sPath);

        if (isMP3 || isSND) {
            let domSource = window.document.createElement('source');
            bindEvent( /** @type {HTMLElement} */ (domSource), 'error', this.domAudio.evError);
            this.uSource++;
            domSource.src = (isMP3 ? this.sPath : this.sPath.replace(/\.snd$/i, ".mp3"));
            domSource.type = 'audio/mpeg';
            this.domAudio.appendChild(domSource);
        }
        if (isOGG || isSND) {
            let domSource = window.document.createElement('source');
            bindEvent( /** @type {HTMLElement} */ (domSource), 'error', this.domAudio.evError);
            this.uSource++;
            domSource.src = (isOGG ? this.sPath : this.sPath.replace(/\.snd$/i, ".ogg"));
            domSource.type = "audio/ogg";
            this.domAudio.appendChild(domSource);
        }

        this.oLoader.oCore.oMixer.register(this.domAudio);

        this.requestPlay();
    }

    /** @private */
    requestPlay() {
        this.domAudio.currentTime = 0;
        this.domAudio.requestPlay(null, this.evRequestPlayFailed);
    }

    /** @private */
    onRequestPlayAgain() {
        this.bPlayAgain = false;
        this.oLoader.uErrorUserInteractionCount--;
        if (this.oLoader.uErrorUserInteractionCount === 0) {
            this.oLoader.fErrorUserInteractionTick = getTickCounter();
        }
        this.requestPlay();
    }

    /** @private */
    onRequestPlayFailed() {
        if (this.domAudio === null)
            return;

        this.bPlayAgain = true;
        MessagePool.registerOnce(evUserInteraction, this.evRequestPlayAgain);
        if (this.oLoader.uErrorUserInteractionCount === 0) {
            this.oLoader.fErrorUserInteractionTick = getTickCounter();
        }
        this.oLoader.uErrorUserInteractionCount++;

        //console.log('Unable to load sound resource, user interaction required! Press any key to continue...');
    }

    cancel() {
        if (this.idRepeat !== null) {
            clearTimeout(this.idRepeat);
            this.idRepeat = null;
        }

        if (this.domAudio === null)
            return;

        this.uSource = 0;
        this.uError = 0;

        this.domAudio.requestPause();

        this.oLoader.oCore.oMixer.unregister(this.domAudio);
        this.unbind();

        if (this.bReady) {
            this.bReady = false;
            this.oLoader.oCore.oMixer.remove(this.sKey);
            this.oLoader.uncache(this);
        }

        this.domAudio = null;
    }

    release() {
        this.oLoader.oCount.uError -= this.uRetry;
        this.uRetry = 0;

        this.cancel();
    }

    /** @param {*} _event */
    evLoad(_event) {
        this.oLoader.oCount.uError -= this.uRetry;

        this.unbind();
        this.bReady = true;
        this.oLoader.oCore.oMixer.createSound(this.sKey, this.domAudio);
        this.oLoader.cache(this);
        this.oLoader.evLoad(this);
        if (this.fnCallback !== null) this.fnCallback(this);
    }

    /** @param {*} _event */
    evError(_event) {
        this.uError++;
        if (this.uError === this.uSource) {
            this.oLoader.oCount.uError++;
            this.oLoader.bStatus = true;

            this.cancel();

            this.uRetry++;
            if ((this.iRepeat < 0) || (this.uRetry <= this.iRepeat)) {
                this.uNext += 3000 + ((Math.random() * 2000) | 0);
                if (this.uNext > 60000) this.uNext = 60000;
                this.idRepeat = setTimeout(this.create.bind(this), this.uNext);
            } else {
                this.oLoader.evError(this);
            }
        }
    }

    /** @param {*} event */
    evPause(event) {
        //console.log(format("Pause {0}", this.sKey));

        if (this.bReady)
            this.evLoad(event);
    }

    /**
     * @private
     * @this {CacheSound}
     */
    static evReady() {
        this.bReady = true;
        if (this.domAudio !== null) {
            this.domAudio.currentTime = 0;
            this.domAudio.volume = 1;
        }
    }

    /** @param {*} _event */
    evDurationChange(_event) {
        //console.log(format("Playing {0}", this.sKey));

        if (this.bPlayAgain)
            return;

        if (!this.bReady) {
            let THIS = this;
            this.domAudio.requestPause(function() {
                CacheSound.evReady.call(THIS);
            });
        }
    }

    /** @param {*} _event */
    evEnded(_event) {
        //console.log(format("End {0}", this.sKey));
    }

    /** @param {*} _event */
    evCanPlayThrough(_event) {
        //console.log(format("Buffered {0}", this.sKey));

        if (this.bPlayAgain)
            return;

        if (!this.bReady) {
            let THIS = this;
            this.domAudio.requestPause(function() {
                CacheSound.evReady.call(THIS);
            });
        }
    }
}

/**
 * @extends {XMLHttpRequest}
 */
class XMLHttpRequestEx {
    constructor() {
        /** @type {CacheItem} */
        this.oCacheItem;
        /** @type {Function} */
        this.evReadyStateChange;

        let ajaxRequest = /** @type {!XMLHttpRequestEx} */ ( new XMLHttpRequest() );

        return ajaxRequest;
    }
}

class CacheData extends CacheItem {
    /**
     * @param {LoaderImpl} oLoader
     * @param {string | null} sGroup 
     * @param {string} sKey 
     * @param {string} sPath
     * @param {string} sExtension
     * @param {Function | null} fnCallback
     */
    constructor(oLoader, sGroup, sKey, sPath, sExtension, fnCallback) {
        super(oLoader, sGroup, sKey, sPath, typeOf(sExtension), fnCallback);

        this.sResponseType = responseTypeOf(sExtension);
        /** @type {XMLHttpRequestEx} */
        this.ajaxRequest = null;
        /** @type {*} */
        this.oData = null;

        /** @type {Array<*>} */
        this.aQuery = [];
        /** @type {Array<*>} */
        this.aSending = [];
    }

    /** @private */
    bind() {
        this.ajaxRequest.evReadyStateChange = CacheData.prototype.evReadyStateChange.bind(this);
        bindEvent(this.ajaxRequest, 'readystatechange', this.ajaxRequest.evReadyStateChange);
    }

    /** @private */
    unbind() {
        if (this.ajaxRequest === null)
            return;

        unbindEvent(this.ajaxRequest, 'readystatechange', this.ajaxRequest.evReadyStateChange);
        delete this.ajaxRequest.evReadyStateChange;
    }

    /**
     * @param {*} oMessage 
     * @returns {CacheData}
     */
    message(oMessage) {
        this.aQuery.push(oMessage);
        return this;
    }

    create() {
        if (this.ajaxRequest !== null)
            return;

        this.bReady = false;
        this.ajaxRequest = new XMLHttpRequestEx();

        this.bind();

        if (this.aQuery.length > 0) {
            this.ajaxRequest.open('POST', this.sPath, true);
            this.ajaxRequest.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
        } else {
            this.ajaxRequest.open('GET', this.sPath, true);
        }
        this.ajaxRequest.responseType = this.sResponseType;

        if (this.aQuery.length > 0) {
            this.ajaxRequest.send(JSON.stringify({
                "token": this.oLoader.sToken,
                "sessid": this.oLoader.sSession,
                "count": this.aQuery.length,
                "data": this.aQuery
            }));
            this.aSending = this.aQuery;
            this.aQuery = [];
        } else {
            this.ajaxRequest.send(null);
        }
    }

    cancel() {
        if (this.idRepeat !== null) {
            clearTimeout(this.idRepeat);
            this.idRepeat = null;
        }

        if (this.ajaxRequest === null)
            return;

        this.unbind();

        if (this.bReady) {
            this.bReady = false;
        }

        this.ajaxRequest = null;
    }

    release() {
        this.oLoader.oCount.uError -= this.uRetry;
        this.uRetry = 0;

        this.cancel();
        this.aQuery = [];
        this.aSending = [];
    }

    /** @private @param {*} _event */
    evLoad(_event) {
        this.oLoader.oCount.uError -= this.uRetry;

        this.unbind();
        this.bReady = true;
        this.aSending = [];

        if (this.ajaxRequest.responseType == "") {
            if (this.sResponseType == LoaderResponseType.JSON)
                try {
                    this.oData = JSON.parse(this.ajaxRequest.responseText);
                } catch (e) {
                    console.log(e);
                    this.oData = null;
                }
            else
                this.oData = this.ajaxRequest.responseText;
        } else
            this.oData = this.ajaxRequest.response;

        this.oLoader.evLoad(this);
        if (this.fnCallback !== null) this.fnCallback(this);
    }

    /** @private @param {*} _event */
    evError(_event) {
        this.oLoader.oCount.uError++;
        this.oLoader.bStatus = true;

        this.cancel();

        if (this.aQuery.length > 0) {
            for (let iIndex = 0; iIndex < this.aQuery.length; iIndex++) {
                this.aSending.push(this.aQuery[iIndex]);
            }
            this.aQuery = this.aSending;
            this.aSending = [];
        }

        //console.log(this.ajaxRequest.statusText);

        this.uRetry++;
        if ((this.iRepeat < 0) || (this.uRetry <= this.iRepeat)) {
            this.uNext += 3000 + ((Math.random() * 2000) | 0);
            if (this.uNext > 60000) this.uNext = 60000;
            this.idRepeat = setTimeout(this.create.bind(this), this.uNext);
        } else {
            this.oLoader.evError(this);
        }
    }

    /** @param {*} event */
    evReadyStateChange(event) {
        if (this.ajaxRequest.readyState === 4) {
            if (this.ajaxRequest.status === 200) {
                this.evLoad(event);
            } else {
                this.evError(event);
            }
        }
    }
}

/** @typedef {Object<string, CacheItem>} LoaderCacheData */
var LoaderCacheData;

/** @typedef {Object<string, LoaderCacheData | CacheItem>} LoaderCache */
var LoaderCache;

class QueueItem {
    /**
     * @param {CacheItem | null} oCacheItem 
     * @param {Function=} fnCallback 
     */
    constructor(oCacheItem, fnCallback) {
        this.oCacheItem = oCacheItem;
        this.fnCallback = fnCallback || null;
    }
}

export class LoaderImpl {
    /** @param {cCore} oCore */
    constructor(oCore) {
        /** @private */ this.oCore = oCore;
        /** @private */ this.guiLoading = new RenderLoading(this);
        /** @private */ this.sBasePath = oCore.__BASE__;

        /** @private @type {LoaderCache} */
        this.oCache = {};
        /** @private @type {Array<string | Function>} */
        this.aSearch = [];
        /** @private @type {Array<QueueItem>} */
        this.aQueue = [];
        /** @private @type {Array<CacheItem>} */
        this.aLoading = [];

        /** @private */
        this.bStatus = false;
        /** @private @type {LoaderStatus} */
        this.oCount = {
            uTotal: 0,
            uComplete: 0,
            uError: 0,
        };

        /** @private @type {Function} */
        this.evUpdate = this.update.bind(this);
        /** @private @type {number | null} */
        this.idUpdate = null;

        /** @type {TextureImpl} */
        this.imgLoading = null;
        /** @private @type {number} */
        this.uErrorUserInteractionCount = 0;
        /** @private @type {number} */
		this.fErrorUserInteractionTick = 0;
		
		/** @private */ this.sToken = "unknown";
		/** @private */ this.sSession = "unknown";
	}

	/**
	 * @param {string} sToken 
	 * @param {string} sSession 
	 */
	setAuth(sToken, sSession) {
		this.sToken = sToken;
		this.sSession = sSession;
	}

    /**
     * @param {string} sBasePath 
     */
    setBasePath(sBasePath) {
        this.sBasePath = this.oCore.__SERVER__ + '/' + sBasePath.replace(/\\/g, '/').replace(/\/$/, '') + '/';
    }

    /**
     * @param {*} oConfig
     * @param {Function=} fnCallback
     * @param {*=} oThis
     * @param {...*} va_args
     */
    load(oConfig, fnCallback, oThis, va_args) {
        if (typeof oConfig === 'string')
            this.loadGroup(null, oConfig, null);
        else if (oConfig['files'] !== undefined)
            this.loadGroup(null, oConfig['files'], null);
        else if (oConfig['groups'] !== undefined)
            for (var sGroup in oConfig['groups'])
                this.loadGroup(sGroup, oConfig['groups'][sGroup], null);

        if ((fnCallback !== undefined) && (fnCallback !== null)) {
            let args = Array.prototype.slice.call(arguments, 2);
            this.aSearch.push(fnCallback);
            this.aQueue.push(new QueueItem(null, fnCallback.bind.apply(fnCallback, args)));
            this.oCount.uTotal++;
        }
    }

    /**
     * @param {string | null} sGroup 
     * @param {*} oGroup 
     * @param {Function=} fnCallback
     */
    loadGroup(sGroup, oGroup, fnCallback) {
        if (typeof oGroup === 'string') {
            let oURI = new URI(this.sBasePath, oGroup);
            this.loadUri(sGroup, oURI.sFile, oURI, null);
        } else if (Array.isArray(oGroup)) {
            for (let i = 0; i < oGroup.length; i++) {
                let oURI = new URI(this.sBasePath, oGroup[i]);
                this.loadUri(sGroup, oURI.sFile, oURI, null);
            }
        } else {
            for (let sKey in oGroup) {
                let oURI = new URI(this.sBasePath, oGroup[sKey]);
                this.loadUri(sGroup, sKey, oURI, null);
            }
        }
        if ((fnCallback !== undefined) && (fnCallback !== null)) {
            this.aSearch.push(fnCallback);
            this.aQueue.push(new QueueItem(null, fnCallback));
            this.oCount.uTotal++;
        }
    }

    /**
     * @param {string | null} sGroup 
     * @param {string} sKey 
     * @param {string} sURL 
     * @param {Function=} fnCallback
     */
    loadUrl(sGroup, sKey, sURL, fnCallback) {
        let oURI = new URI(this.sBasePath, sURL);
        this.loadUri(sGroup, sKey, oURI, fnCallback);
    }

    /**
     * @private
     * @param {string | null} sGroup 
     * @param {string} sKey 
     * @param {URI} oURI 
     * @param {Function=} fnCallback
     */
    loadUri(sGroup, sKey, oURI, fnCallback) {
        /** @type {QueueItem} */
        let oQueueItem;

        let sType = typeOf(oURI.sExtension);
        let sPath = oURI.build();
        if (sType == LoaderSupportedType.IMAGE) {
            oQueueItem = new QueueItem(new CacheImage(this, sGroup, sKey, sPath, fnCallback || null), null);
        } else if (sType == LoaderSupportedType.SOUND) {
            oQueueItem = new QueueItem(new CacheSound(this, sGroup, sKey, sPath, fnCallback || null), null);
        } else {
            oQueueItem = new QueueItem(new CacheData(this, sGroup, sKey, sPath, oURI.sExtension, fnCallback || null), null);
        }

        this.aSearch.push(sGroup + ':' + sKey + ':' + sPath);
        this.aQueue.push(oQueueItem);
        this.oCount.uTotal++;
    }

    /**
     * @param {*} oConfig
     * @param {Function=} fnCallback
     */
    unload(oConfig, fnCallback) {
        if (typeof oConfig === 'string')
            this.unloadGroup(null, oConfig, null);
        else if (oConfig['files'] !== undefined)
            this.unloadGroup(null, oConfig['files'], null);
        else if (oConfig['groups'] !== undefined)
            for (var sGroup in oConfig['groups'])
                this.unloadGroup(sGroup, oConfig['groups'][sGroup], null);
        if ((fnCallback !== undefined) && (fnCallback !== null)) {
            let iIndex = this.aSearch.indexOf(fnCallback);
            if (iIndex >= 0) {
                this.aSearch.splice(iIndex, 1);
                this.aQueue.splice(iIndex, 1);
                this.oCount.uTotal--;
            }
        }
    }

    /**
     * @param {string | null} sGroup 
     * @param {*} oGroup 
     * @param {Function=} fnCallback
     */
    unloadGroup(sGroup, oGroup, fnCallback) {
        if (typeof oGroup === 'string') {
            let oURI = new URI(this.sBasePath, oGroup);
            this.unloadUri(sGroup, oURI.sFile, oURI);
        } else if (Array.isArray(oGroup)) {
            for (let i = 0; i < oGroup.length; i++) {
                let oURI = new URI(this.sBasePath, oGroup[i]);
                this.unloadUri(sGroup, oURI.sFile, oURI);
            }
        } else {
            for (let sKey in oGroup) {
                let oURI = new URI(this.sBasePath, oGroup[sKey]);
                this.unloadUri(sGroup, sKey, oURI);
            }
        }
        if ((fnCallback !== undefined) && (fnCallback !== null)) {
            let iIndex = this.aSearch.indexOf(fnCallback);
            if (iIndex >= 0) {
                this.aSearch.splice(iIndex, 1);
                this.aQueue.splice(iIndex, 1);
                this.oCount.uTotal--;
            }
        }
    }

    /**
     * @param {string | null} sGroup 
     * @param {string} sKey 
     * @param {string} sURL 
     */
    unloadUrl(sGroup, sKey, sURL) {
        let oURI = new URI(this.sBasePath, sURL);
        this.unloadUri(sGroup, sKey, oURI);
    }

    /**
     * @private
     * @param {string | null} sGroup 
     * @param {string} sKey 
     * @param {URI} oURI 
     */
    unloadUri(sGroup, sKey, oURI) {
        let sSearch = sGroup + ':' + sKey + ':' + oURI.build();
        let iIndex = this.aSearch.indexOf(sSearch);
        if (iIndex >= 0) {
            this.aSearch.splice(iIndex, 1);
            this.aQueue.splice(iIndex, 1);
            this.oCount.uTotal--;
        }

        if (sGroup !== null) {
            if (this.oCache[sGroup] === undefined)
                return;
            if (this.oCache[sGroup].hasOwnProperty(sKey)) {
                let o = /** @type {*} */ (this.oCache[sGroup]);
                delete o[sKey];
            }
        } else
            delete this.oCache[sKey];
    }

    /**
     * @param {string} sURL 
     * @param {*} oMessage 
     * @param {Function} fnCallback
     */
    query(sURL, oMessage, fnCallback) {
        let oURI = new URI(this.sBasePath, sURL);
        let sPath = oURI.build();
        for (let i = this.aQueue.length - 1; i >= 0; i--) {
            let oQueueItem = this.aQueue[i];
            if (oQueueItem.oCacheItem !== null) {
                if (oQueueItem.oCacheItem.sPath == sPath) {
                    let oCacheData = /** @type {CacheData} */ (oQueueItem.oCacheItem);
                    oCacheData.message(oMessage);
                    return;
                }
            }
        }

        let oCacheData = new CacheData(this, 'api', 'query', sPath, oURI.sExtension, fnCallback).message(oMessage);
        this.aSearch.push('api:query:' + sPath);
        this.aQueue.push(new QueueItem(oCacheData, null));
        this.oCount.uTotal++;
    }

    /** @private */
    update() {
        let uMaxCount = LOADER_SPEED - this.aLoading.length;
        let iCount = this.aQueue.length;
        if (this.oCount.uError > 0) iCount = 0;
        if (iCount > uMaxCount) iCount = uMaxCount;
        if (iCount == 0) iCount = -1;
        else if (this.bStatus) {
            this.oCore.event(Event.evLoaderStatus, this.oCount);
            this.bStatus = false;
        }
        while (iCount > 0) {
            let oQueueItem = this.aQueue[0];
            if (oQueueItem.oCacheItem === null) {
                if (this.aLoading.length === 0) {
                    this.aSearch.shift();
                    this.aQueue.shift();
                    this.oCount.uComplete++;
                    oQueueItem.fnCallback();
                } else {
                    break;
                }
            } else {
                this.aSearch.shift();
                this.aQueue.shift();
                this.aLoading.push(oQueueItem.oCacheItem);
                oQueueItem.oCacheItem.create();
            }
            iCount--;
        }
        if ((this.aLoading.length > 0) || (iCount === 0)) {
            this.idUpdate = setTimeout(this.evUpdate, 15);
        } else {
            this.idUpdate = null;

            if (this.oCount.uError > 0)
                this.onFatal();
            else {
                this.onComplete(this.oCache);
            }
        }
    }

    run() {
        this.imgLoading = this.oCore.oGalery.get("loader#loading");
        if (this.idUpdate === null) {
            this.idUpdate = setTimeout(this.evUpdate, 15);
        }
    }

    stop() {
        if (this.idUpdate !== null) {
            clearTimeout(this.idUpdate);
            this.idUpdate = null;
        }

        for (let iIndex = this.aLoading.length - 1; iIndex >= 0; iIndex--) {
            let oCacheItem = this.aLoading[iIndex];
            oCacheItem.cancel();
            let oQueueItem = new QueueItem(oCacheItem, null);
            this.aSearch.unshift(oCacheItem.sGroup + ':' + oCacheItem.sKey + ':' + oCacheItem.sPath);
            this.aQueue.unshift(oQueueItem);
        }
        this.aLoading = [];
    }

    release() {
        if (this.idUpdate !== null) {
            clearTimeout(this.idUpdate);
            this.idUpdate = null;
        }

        for (let iIndex = this.aLoading.length - 1; iIndex >= 0; iIndex--) {
            this.aLoading[iIndex].release();
        }
        this.aLoading = [];

        for (let iIndex = this.aQueue.length - 1; iIndex >= 0; iIndex--) {
            let oQueueItem = this.aQueue[iIndex];
            if (oQueueItem.oCacheItem !== null)
                oQueueItem.oCacheItem.release();
        }
        this.aSearch = [];
        this.aQueue = [];

        for (let sGroup in this.oCache) {
            let oGroup = this.oCache[sGroup];
            if (oGroup instanceof CacheItem) {
                let oCacheItem = /** @type {CacheItem} */ (oGroup);
                oCacheItem.release();
            } else {
                for (let sKey in oGroup) {
                    let oCacheItem = /** @type {CacheItem} */ (oGroup[sKey]);
                    oCacheItem.release();
                }
            }
        }
        this.oCache = {};

        this.oCount.uTotal = 0;
        this.oCount.uComplete = 0;
        this.oCount.uError = 0;
    }

    /**
     * @param {CacheItem} oCacheItem
     */
    cache(oCacheItem) {
        if (oCacheItem.sGroup !== null) {
            if (this.oCache[oCacheItem.sGroup] === undefined)
                this.oCache[oCacheItem.sGroup] = {};

            let o = /** @type {*} */ (this.oCache[oCacheItem.sGroup]);
            o[oCacheItem.sKey] = oCacheItem;
        } else
            this.oCache[oCacheItem.sKey] = oCacheItem;
    }

    /**
     * @param {CacheItem} oCacheItem
     */
    uncache(oCacheItem) {
        if (oCacheItem.sGroup !== null) {
            if (this.oCache[oCacheItem.sGroup] === undefined)
                return;
            if (this.oCache[oCacheItem.sGroup].hasOwnProperty(oCacheItem.sKey)) {
                let o = /** @type {*} */ (this.oCache[oCacheItem.sGroup]);
                delete o[oCacheItem.sKey];
            }
        } else
            delete this.oCache[oCacheItem.sKey];
    }

    /**
     * @param {CacheItem} oCacheItem
     */
    evLoad(oCacheItem) {
        this.oCount.uComplete++;
        this.bStatus = true;
        let iIndex = this.aLoading.indexOf(oCacheItem);
        this.aLoading.splice(iIndex, 1);
        this.oCore.event(Event.evLoaderFile, oCacheItem);
    }

    /**
     * @param {CacheItem} oCacheItem
     */
    evError(oCacheItem) {
        this.oCount.uError++;
        this.bStatus = true;
        let iIndex = this.aLoading.indexOf(oCacheItem);
        this.aLoading.splice(iIndex, 1);
        this.oCore.event(Event.evLoaderError, oCacheItem);
    }

    /**
     * @private
     * @param {*} oCache 
     */
    onComplete(oCache) {
        this.oCore.event(Event.evLoaderComplete, oCache);
    }

    /**
     * @private
     */
    onFatal() {
        this.oCore.event(Event.evLoaderTerminate);
    }
}

const aRGBARed = [1, 0, 0, 1];

class RenderArc {
	/**
	 * @param {number=} uArcElements
	 */
    constructor(uArcElements) {
		this.uArcElements = (uArcElements || 5) * 2;
        this.aBack = RenderArc.generateArcs(this.uArcElements);
        this.aFront = RenderArc.generateArcs(this.uArcElements);
        this.fOffset = 0;

        let fSign = (Math.random() < 0.5) ? -1 : 1;
        this.fSpeed = fSign * (Math.random() * 0.5 + 0.5) * 2 * Math.PI / 360;
        this.fHUE = Math.random() * 360;
        this.fSaturation = Math.random() * 0.5 + 0.5;
        this.fIntensity = Math.random() * 0.5 + 0.5;
    }

    /**
	 * @private
	 * @param {number} uArcElements
	 * @returns {Array<number>}
	 */
    static generateArcs(uArcElements) {
        /** @type {Array<number>} */
        let aArcs = [];
        let fOffset = Math.random() + 0.01;
        for (let i = 0; i < uArcElements; i++) {
            aArcs.push(fOffset);
            fOffset += Math.random() + 0.01;
        }
        fOffset += Math.random() + 0.01;
        for (var i = 0; i < uArcElements; i++) {
            aArcs[i] = aArcs[i] * 2 * Math.PI / fOffset;
        }
        return aArcs;
    }

    /**
     * @private
     * @param {CanvasRenderingContext2D} context 
     * @param {number} iX 
     * @param {number} iY 
     * @param {number} fSize 
     * @param {Array<number>} aArc 
     * @param {number} fOffset 
     */
    static renderArc(context, iX, iY, fSize, aArc, fOffset) {
        for (let i = 0; i < this.uArcElements; i += 2) {
            context.beginPath();
            context.arc(iX, iY, fSize, aArc[i] + fOffset, aArc[i + 1] + fOffset, false);
            context.stroke();
        }
    }

    /**
     * @param {CanvasRenderingContext2D} oContext 
     * @param {number} iX 
     * @param {number} iY 
     * @param {number} fSize 
	 * @param {number} fError
     */
    render(oContext, iX, iY, fSize, fError) {
        oContext.lineWidth = 7;
        oContext.lineCap = 'square';
        oContext.strokeStyle = '#000000';
        RenderArc.renderArc(oContext, iX, iY, fSize, this.aBack, this.fOffset / 2);
        RenderArc.renderArc(oContext, iX, iY, fSize, this.aFront, this.fOffset);
		oContext.lineWidth = 5;
        oContext.strokeStyle = RGBA2STR(MorphRGBA(aRGBARed, HSIA2RGBA(this.fHUE, this.fSaturation, this.fIntensity, 0.5), fError));
        RenderArc.renderArc(oContext, iX, iY, fSize, this.aBack, this.fOffset / 2);
        oContext.strokeStyle = RGBA2STR(MorphRGBA(aRGBARed, HSIA2RGBA(this.fHUE, this.fSaturation, this.fIntensity, 1.0), fError));
        RenderArc.renderArc(oContext, iX, iY, fSize, this.aFront, this.fOffset);
    }
}

class RenderLoading {
    /**
	 * @param {LoaderImpl} oLoader
	 * @param {number=} uArcsCount
	 */
    constructor(oLoader, uArcsCount) {
		this.oLoader = oLoader;
		this.uArcsCount = uArcsCount || 5;
        /** @type {Array<RenderArc>} */
        this.guiArcs;
        this.reset();
    }

    reset() {
        this.guiArcs = [];

        for (let i = 0; i < this.uArcsCount; i++) {
            this.guiArcs.push(new RenderArc());
        }
    }

    /**
     * @param {CanvasRenderingContext2D} oContext 
     * @param {number} iX 
     * @param {number} iY 
     */
    render(oContext, iX, iY) {
        let fErrorInterval = getTickCounter() - this.oLoader.fErrorUserInteractionTick;
        let fErrorDistance = (this.oLoader.fErrorUserInteractionTick === 0) ? 1 : (
            (this.oLoader.uErrorUserInteractionCount === 0) ? Math.min(fErrorInterval / 250, 1) : Math.max(1 - (fErrorInterval / 250), 0)
        );

        if (this.oLoader.imgLoading !== null) {
            oContext.drawImage(this.oLoader.imgLoading.domElement, 0, 0);
        }

        for (let i = 0; i < this.uArcsCount; i++) {
            let guiArc = this.guiArcs[i];
            var fSize = i * 10 + 50;
            guiArc.render(oContext, iX, iY, fSize, fErrorDistance);
            guiArc.fOffset += guiArc.fSpeed;
            if (guiArc.fOffset >= 4 * Math.PI) guiArc.fOffset -= 4 * Math.PI;
            if (guiArc.fOffset < 0) guiArc.fOffset += 4 * Math.PI;
        }

        if (fErrorDistance < 1) {
            if ((((fErrorInterval / 500) | 0) % 2) == 0) {
                let sText = this.oLoader.oCore.oLang.get('wPressAnyKey');

                oContext.font = "normal 40px Arial";
                oContext.textAlign = "center";
                oContext.textBaseline = "middle";
                oContext.strokeStyle = "#000000";
                oContext.lineWidth = 3;
                oContext.strokeText(sText, iX, iY);
                oContext.fillStyle = "#80CCFF";
                oContext.fillText(sText, iX, iY);
            }
        } else {
            let iPercent = (this.oLoader.oCount.uComplete * 100 / this.oLoader.oCount.uTotal) | 0;
            if (iPercent >= 100) iPercent = 99;
            if (iPercent > 0) {
                let sText = iPercent + '%';

                oContext.font = "normal 28px Arial";
                oContext.textAlign = "center";
                oContext.textBaseline = "middle";
                oContext.strokeStyle = "#000000";
                oContext.lineWidth = 3;
                oContext.strokeText(sText, iX, iY);
                oContext.fillStyle = "#80CCFF";
                oContext.fillText(sText, iX, iY);
            }
        }
    }
}
