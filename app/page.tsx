"use client";

import React, { useState, useEffect, useRef } from "react";
import { useMicVAD, utils } from "@ricky0123/vad-react";
import { Button, cn, ScrollShadow, Tooltip } from "@nextui-org/react";
import { LangObj, LanguageOptions } from "@/types/lang";
import { TranslationResponse } from "@/types/common";
import ShineBorder from "@/components/magicui/shine-border";
import LanguageSelection from "./subsirl/LanguageSelection";
import { BorderBeam } from "@/components/magicui/border-beam";
import Ripple from "@/components/magicui/ripple";
import DotPattern from "@/components/magicui/dot-pattern";

export default function RealtimeTranslation() {
  const [translatedSubtitles, setTranslatedSubtitles] = useState("");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [languageSelected, setLanguageSelected] = useState<LangObj>({
    fromLanguage: LanguageOptions[0],
    toLanguage: LanguageOptions[3],
  });
  const [loading, setLoading] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isFrontCamera, setIsFrontCamera] = useState(true);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const subtitlesRef = useRef<HTMLDivElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const translationQueue = useRef<
    Array<{ id: number; promise: Promise<TranslationResponse> }>
  >([]);
  const nextId = useRef(0);

  useEffect(() => {
    if (isCameraOn) {
      startCamera();
    } else {
      stopCamera();
    }
  }, [isCameraOn, isFrontCamera]);

  useEffect(() => {
    if (subtitlesRef.current) {
      subtitlesRef.current.scrollTop = subtitlesRef.current.scrollHeight;
    }
  }, [translatedSubtitles]);

  const startCamera = async () => {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: isFrontCamera ? "user" : "environment" },
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        streamRef.current = stream;
      } catch (err) {
        console.error("Error accessing camera:", err);
      }
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const toggleCamera = () => {
    setIsCameraOn(!isCameraOn);
  };

  const switchCamera = () => {
    setIsFrontCamera(!isFrontCamera);
  };

  useMicVAD({
    startOnLoad: true,
    onSpeechStart: () => setIsSpeaking(true),
    onSpeechEnd: (audio) => {
      setIsSpeaking(false);
      const wav = utils.encodeWAV(audio);
      const blob = new Blob([wav], { type: "audio/wav" });
      enqueueTranscription(blob, languageSelected);
    },
    workletURL: "/vad.worklet.bundle.min.js",
    modelURL: "/silero_vad.onnx",
    positiveSpeechThreshold: 0.9, // Higher sensitivity for detecting speech
    negativeSpeechThreshold: 0.1, // Lower sensitivity for detecting non-speech
    redemptionFrames: 2, // Quick transition to non-speech state
    frameSamples: 1000, // Default frame size
    preSpeechPadFrames: 5, // Minimal pre-speech padding
    minSpeechFrames: 2,
    ortConfig(ort: {
      env: {
        wasm: {
          wasmPaths: {
            "ort-wasm-simd-threaded.wasm": string;
            "ort-wasm-simd.wasm": string;
            "ort-wasm.wasm": string;
            "ort-wasm-threaded.wasm": string;
          };
          numThreads: number;
        };
      };
    }) {
      const isSafari = /^((?!chrome|android).)*safari/i.test(
        navigator.userAgent
      );

      ort.env.wasm = {
        wasmPaths: {
          "ort-wasm-simd-threaded.wasm": "/ort-wasm-simd-threaded.wasm",
          "ort-wasm-simd.wasm": "/ort-wasm-simd.wasm",
          "ort-wasm.wasm": "/ort-wasm.wasm",
          "ort-wasm-threaded.wasm": "/ort-wasm-threaded.wasm",
        },
        numThreads: isSafari ? 1 : 4,
      };
    },
  });

  const getTranscribe = async (
    audioBlob: Blob,
    languageSelected: LangObj
  ): Promise<any> => {
    const formData = new FormData();
    formData.append("audio", audioBlob, "audio.wav");
    formData.append("config", JSON.stringify(languageSelected));

    try {
      setLoading(true);

      const response = await fetch("/api/subsirl", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Transcription request failed");
      }

      const result: TranslationResponse = await response.json();
      if (result.translation.trim()) {
        setTranslatedSubtitles((prev) => `${prev} ${result.translation}`);
      }
    } catch (error) {
      console.error("Error in transcription:", error);
    } finally {
      setLoading(false);
    }
  };

  const processQueue = async () => {
    if (translationQueue.current.length === 0) return;

    const { id, promise } = translationQueue.current[0];
    try {
      const result = await promise;
      if (result.translation.trim()) {
        setTranslatedSubtitles((prev) => `${prev} ${result.translation}`);
      }
    } catch (error) {
      console.error("Error in transcription:", error);
    } finally {
      translationQueue.current.shift();
      processQueue();
    }
  };

  const enqueueTranscription = async (
    audioBlob: Blob,
    languageSelected: LangObj
  ) => {
    const id = nextId.current++;
    const promise = getTranscribe(audioBlob, languageSelected);
    translationQueue.current.push({ id, promise });

    processQueue();
  };

  return (
    <ShineBorder
      borderRadius={16}
      className={cn(
        "relative h-screen w-full overflow-hidden flex flex-col items-center justify-center "
      )}
      color={["#18181B", "#A1A1AA", "#F4F4F5"]}
      borderWidth={isSpeaking ? 5 : 0}
    >
      {isCameraOn ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute m-auto h-[98vh] w-[98vw] rounded-2xl  object-cover z-0"
        />
      ) : (
        <DotPattern
          className={cn(
            "[mask-image:radial-gradient(300px_circle_at_center,white,transparent)]"
          )}
        />
      )}
      <div className="relative z-20 h-full w-full flex flex-col items-center justify-center">
        <div className="text-gray-300 text-sm mb-4 flex justify-center items-center flex-col gap-3 text-shadow ">
          {isSpeaking && <Ripple mainCircleOpacity={0.2} />}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width="50"
            height="50"
            fill="none"
          >
            <path
              d="M17 7V11C17 13.7614 14.7614 16 12 16C9.23858 16 7 13.7614 7 11V7C7 4.23858 9.23858 2 12 2C14.7614 2 17 4.23858 17 7Z"
              stroke="currentColor"
              stroke-width="1.5"
            />
            <path
              d="M17 7H14M17 11H14"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
            />
            <path
              d="M20 11C20 15.4183 16.4183 19 12 19M12 19C7.58172 19 4 15.4183 4 11M12 19V22M12 22H15M12 22H9"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
            />
          </svg>
          {isSpeaking ? "Listening" : "Waiting for speech..."}
          <div className="flex gap-2">
            <Tooltip showArrow content="Turn Camera on/off">
              <Button
                isIconOnly
                size="lg"
                variant="flat"
                onClick={toggleCamera}
              >
                {isCameraOn ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    width="24"
                    height="24"
                    fill="none"
                  >
                    <path
                      d="M11 8L13 8"
                      stroke="currentColor"
                      stroke-width="1.5"
                      stroke-linecap="round"
                    />
                    <path
                      d="M2 11C2 7.70017 2 6.05025 3.02513 5.02513C4.05025 4 5.70017 4 9 4H10C13.2998 4 14.9497 4 15.9749 5.02513C17 6.05025 17 7.70017 17 11V13C17 16.2998 17 17.9497 15.9749 18.9749C14.9497 20 13.2998 20 10 20H9C5.70017 20 4.05025 20 3.02513 18.9749C2 17.9497 2 16.2998 2 13V11Z"
                      stroke="currentColor"
                      stroke-width="1.5"
                    />
                    <path
                      d="M17 8.90585L17.1259 8.80196C19.2417 7.05623 20.2996 6.18336 21.1498 6.60482C22 7.02628 22 8.42355 22 11.2181V12.7819C22 15.5765 22 16.9737 21.1498 17.3952C20.2996 17.8166 19.2417 16.9438 17.1259 15.198L17 15.0941"
                      stroke="currentColor"
                      stroke-width="1.5"
                      stroke-linecap="round"
                    />
                  </svg>
                ) : (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    width="24"
                    height="24"
                    fill="none"
                  >
                    <path
                      d="M2.00189 1.99988L21.9772 21.9999"
                      stroke="currentColor"
                      stroke-width="1.5"
                      stroke-linecap="round"
                    />
                    <path
                      d="M16.8516 16.8677C16.7224 17.8061 16.4665 18.4668 15.9595 18.9744C14.9356 19.9996 13.2877 19.9996 9.992 19.9996H8.99323C5.69749 19.9996 4.04961 19.9996 3.02575 18.9744C2.00189 17.9493 2.00189 16.2994 2.00189 12.9996V10.9996C2.00189 7.69971 2.00189 6.04979 3.02575 5.02466C3.36827 4.68172 3.78062 4.45351 4.30114 4.30164"
                      stroke="currentColor"
                      stroke-width="1.5"
                      stroke-linecap="round"
                    />
                    <path
                      d="M8.23627 4.0004C8.47815 3.99988 8.72995 3.99988 8.99217 3.99988H9.99093C13.2867 3.99988 14.9346 3.99988 15.9584 5.02501C16.9822 6.05013 16.9822 7.70005 16.9822 10.9999V12.7573M16.9822 9.2313L19.3018 7.52901C20.7729 6.54061 21.4489 7.17184 21.6674 7.64835C22.1191 8.92801 21.9768 11.3935 21.9768 14.5416C21.8703 16.5549 21.5952 16.7718 21.3137 16.9938L21.3107 16.9961"
                      stroke="currentColor"
                      stroke-width="1.5"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                )}
              </Button>
            </Tooltip>
            {isCameraOn && (
              <Tooltip showArrow content="Switch Camera">
                <Button
                  isIconOnly
                  size="lg"
                  variant="flat"
                  onClick={switchCamera}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    width="24"
                    height="24"
                    fill="none"
                  >
                    <path
                      d="M17 6C19.3456 6 20.0184 6 20.8263 6.61994C21.0343 6.77954 21.2205 6.96572 21.3801 7.17372C22 7.98164 22 9.15442 22 11.5V16C22 18.8284 22 20.2426 21.1213 21.1213C20.2426 22 18.8284 22 16 22H8C5.17157 22 3.75736 22 2.87868 21.1213C2 20.2426 2 18.8284 2 16V11.5C2 9.15442 2 7.98164 2.61994 7.17372C2.77954 6.96572 2.96572 6.77954 3.17372 6.61994C3.98164 6 4.65442 6 7 6"
                      stroke="currentColor"
                      stroke-width="1.5"
                      stroke-linecap="round"
                    />
                    <path
                      d="M17 7L16.1142 4.78543C15.732 3.82996 15.3994 2.7461 14.4166 2.25955C13.8924 2 13.2616 2 12 2C10.7384 2 10.1076 2 9.58335 2.25955C8.6006 2.7461 8.26801 3.82996 7.88583 4.78543L7 7"
                      stroke="currentColor"
                      stroke-width="1.5"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                    <path
                      d="M14.4868 10L14.9861 12.0844L14.1566 11.5661C13.5657 11.1173 12.8313 10.8512 12.0354 10.8512C10.0828 10.8512 8.5 12.4515 8.5 14.4256C8.5 16.3997 10.0828 18 12.0354 18C13.7457 18 15.1724 16.772 15.5 15.1405"
                      stroke="currentColor"
                      stroke-width="1.5"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                    <path
                      d="M11.9998 6H12.0088"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                </Button>
              </Tooltip>
            )}
          </div>
        </div>
        <div className=" w-full absolute bottom-0 left-0">
          <ScrollShadow
            ref={subtitlesRef}
            hideScrollBar
            className="h-full max-h-[35vh]  overflow-auto scrollbar-none w-full text-white p-2 px-3  sm:p-8 sub_tb "
          >
            {loading && <BorderBeam colorFrom="#18181B" colorTo="#F4F4F5" />}
            <p className=" text-lg  sm:text-2xl leading-8 ">
              {translatedSubtitles
                ?.replaceAll('"', "")
                .replaceAll(" .", ".")
                .replaceAll(" ,", ".")
                .replaceAll(" ?", "?")}
            </p>
          </ScrollShadow>
        </div>
        <div className="absolute top-0 flex justify-between items-center gap-3 w-full">
          <Button isIconOnly size="lg" variant="light" onClick={switchCamera}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              width="30"
              height="30"
              fill="none"
            >
              <path
                d="M5 5.96552H8.15M12 5.96552H10.25M8.15 5.96552H10.25M8.15 5.96552V5M10.25 5.96552C9.88076 7.28593 9.10754 8.53411 8.225 9.63103M5.975 12C6.68843 11.344 7.4942 10.5394 8.225 9.63103M8.225 9.63103C7.775 9.10345 7.145 8.24984 6.965 7.86364M8.225 9.63103L9.575 11.0345"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <path
                d="M7.02231 16.9777C7.07674 18.6978 7.26397 19.7529 7.90796 20.5376C8.07418 20.7401 8.25989 20.9258 8.46243 21.092C9.56878 22 11.2125 22 14.5 22C17.7875 22 19.4312 22 20.5376 21.092C20.7401 20.9258 20.9258 20.7401 21.092 20.5376C22 19.4312 22 17.7875 22 14.5C22 11.2125 22 9.56878 21.092 8.46243C20.9258 8.25989 20.7401 8.07418 20.5376 7.90796C19.7563 7.26676 18.707 7.07837 17 7.02303M7.02231 16.9777C5.30217 16.9233 4.24713 16.736 3.46243 16.092C3.25989 15.9258 3.07418 15.7401 2.90796 15.5376C2 14.4312 2 12.7875 2 9.5C2 6.21252 2 4.56878 2.90796 3.46243C3.07418 3.25989 3.25989 3.07418 3.46243 2.90796C4.56878 2 6.21252 2 9.5 2C12.7875 2 14.4312 2 15.5376 2.90796C15.7401 3.07418 15.9258 3.25989 16.092 3.46243C16.736 4.24713 16.9233 5.30217 16.9777 7.02231C16.9777 7.02231 16.9777 7.02231 17 7.02303M7.02231 16.9777L17 7.02303"
                stroke="currentColor"
                stroke-width="1.5"
              />
              <path
                d="M13 19L13.8333 17M18 19L17.1667 17M13.8333 17L15.5 13L17.1667 17M13.8333 17H17.1667"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </Button>
          <LanguageSelection
            languageSelected={languageSelected}
            setLanguageSelected={setLanguageSelected}
          />
          <Button isIconOnly size="lg" variant="flat" onClick={switchCamera}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              width="24"
              height="24"
              fill="none"
            >
              <path
                d="M2 6C2 4.11438 2 3.17157 2.58579 2.58579C3.17157 2 4.11438 2 6 2C7.88562 2 8.82843 2 9.41421 2.58579C10 3.17157 10 4.11438 10 6V8C10 9.88562 10 10.8284 9.41421 11.4142C8.82843 12 7.88562 12 6 12C4.11438 12 3.17157 12 2.58579 11.4142C2 10.8284 2 9.88562 2 8V6Z"
                stroke="currentColor"
                stroke-width="1.5"
              />
              <path
                d="M2 19C2 18.0681 2 17.6022 2.15224 17.2346C2.35523 16.7446 2.74458 16.3552 3.23463 16.1522C3.60218 16 4.06812 16 5 16H7C7.93188 16 8.39782 16 8.76537 16.1522C9.25542 16.3552 9.64477 16.7446 9.84776 17.2346C10 17.6022 10 18.0681 10 19C10 19.9319 10 20.3978 9.84776 20.7654C9.64477 21.2554 9.25542 21.6448 8.76537 21.8478C8.39782 22 7.93188 22 7 22H5C4.06812 22 3.60218 22 3.23463 21.8478C2.74458 21.6448 2.35523 21.2554 2.15224 20.7654C2 20.3978 2 19.9319 2 19Z"
                stroke="currentColor"
                stroke-width="1.5"
              />
              <path
                d="M14 16C14 14.1144 14 13.1716 14.5858 12.5858C15.1716 12 16.1144 12 18 12C19.8856 12 20.8284 12 21.4142 12.5858C22 13.1716 22 14.1144 22 16V18C22 19.8856 22 20.8284 21.4142 21.4142C20.8284 22 19.8856 22 18 22C16.1144 22 15.1716 22 14.5858 21.4142C14 20.8284 14 19.8856 14 18V16Z"
                stroke="currentColor"
                stroke-width="1.5"
              />
              <path
                d="M14 5C14 4.06812 14 3.60218 14.1522 3.23463C14.3552 2.74458 14.7446 2.35523 15.2346 2.15224C15.6022 2 16.0681 2 17 2H19C19.9319 2 20.3978 2 20.7654 2.15224C21.2554 2.35523 21.6448 2.74458 21.8478 3.23463C22 3.60218 22 4.06812 22 5C22 5.93188 22 6.39782 21.8478 6.76537C21.6448 7.25542 21.2554 7.64477 20.7654 7.84776C20.3978 8 19.9319 8 19 8H17C16.0681 8 15.6022 8 15.2346 7.84776C14.7446 7.64477 14.3552 7.25542 14.1522 6.76537C14 6.39782 14 5.93188 14 5Z"
                stroke="currentColor"
                stroke-width="1.5"
              />
            </svg>
          </Button>
        </div>
      </div>
    </ShineBorder>
  );
}
