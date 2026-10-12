/**
 * The global interfaces whose prototype has its own `on...` properties. The
 * event patch reads only these globals. For each global that code reads for
 * the first time, the browser makes the interface object, and a page has
 * approximately 1,000 interfaces. With a read of all globals (version 0.1),
 * the patches took 16 to 22 ms when the page loaded. With this list, they
 * take 7 to 8 ms (the medians in CHANGELOG.md, version 0.2.0).
 *
 * The list is the union of Chromium 156, Firefox 157 and WebKit 27.2 in a
 * secure context. It also has some interfaces of Safari, of mobile browsers
 * and of workers. The test "patches each on... property of each interface" in
 * `test/browser/c13-events.test.ts` reads all globals in each browser of the
 * tests, and fails for an `on...` property without the patch. Add the
 * interface here if the test fails.
 */
export const HANDLER_INTERFACES : readonly string[] = [
    "AbortSignal", "Animation", "ApplePaySession", "AudioContext", "AudioDecoder", "AudioEncoder",
    "AudioScheduledSourceNode", "AudioTrackList", "AudioWorkletNode", "BackgroundFetchRegistration",
    "BaseAudioContext", "BatteryManager", "Bluetooth", "BluetoothDevice", "BluetoothRemoteGATTCharacteristic",
    "BluetoothRemoteGATTService", "BroadcastChannel", "CaptureController", "Clipboard", "CloseWatcher", "CookieStore",
    "CreateMonitor", "DedicatedWorkerGlobalScope", "DevicePosture", "Document", "DocumentPictureInPicture",
    "EditContext", "Element", "EventSource", "FileReader", "FontFaceSet", "GPUDevice", "HID", "HIDDevice",
    "HTMLBodyElement", "HTMLCameraElement", "HTMLElement", "HTMLFrameSetElement", "HTMLGeolocationElement",
    "HTMLMediaElement", "HTMLMicrophoneElement", "HTMLUserMediaElement", "HTMLVideoElement", "IDBDatabase",
    "IDBOpenDBRequest", "IDBRequest", "IDBTransaction", "IdleDetector", "LanguageModel", "ManagedMediaSource",
    "ManagedSourceBuffer", "MathMLElement", "MediaDevices", "MediaKeySession", "MediaQueryList", "MediaRecorder",
    "MediaSource", "MediaStream", "MediaStreamTrack", "MessagePort", "MIDIAccess", "MIDIInput", "MIDIPort",
    "Navigation", "NavigationHistoryEntry", "NavigatorManagedData", "NDEFReader", "NetworkInformation",
    "Notification", "OfflineAudioContext", "OffscreenCanvas", "PaymentRequest", "PaymentResponse", "Performance",
    "PermissionStatus", "PictureInPictureWindow", "PresentationAvailability", "PresentationConnection",
    "PresentationConnectionList", "PresentationRequest", "RemotePlayback", "RTCDataChannel", "RTCDtlsTransport",
    "RTCDTMFSender", "RTCIceTransport", "RTCPeerConnection", "RTCSctpTransport", "Screen", "ScreenDetails",
    "ScreenOrientation", "ScriptProcessorNode", "Sensor", "Serial", "SerialPort", "ServiceWorker",
    "ServiceWorkerContainer", "ServiceWorkerGlobalScope", "ServiceWorkerRegistration", "ShadowRoot", "SharedWorker",
    "SharedWorkerGlobalScope", "SourceBuffer", "SourceBufferList", "SpeechRecognition", "SpeechSynthesis",
    "SpeechSynthesisUtterance", "SVGAnimationElement", "SVGElement", "TaskSignal", "TextTrack", "TextTrackCue",
    "TextTrackList", "USB", "VideoDecoder", "VideoEncoder", "VideoTrackList", "VirtualKeyboard", "VisualViewport",
    "WakeLockSentinel", "WebKitMediaKeySession", "webkitMediaStream", "webkitRTCPeerConnection",
    "webkitSpeechRecognition", "WebSocket", "Window", "WindowControlsOverlay", "Worker", "WorkerGlobalScope",
    "XMLHttpRequest", "XMLHttpRequestEventTarget", "XRCubeLayer", "XRCylinderLayer", "XREquirectLayer",
    "XRLightProbe", "XRQuadLayer", "XRReferenceSpace", "XRSession", "XRSystem",
];
