"use client";

import React, { useState, useEffect, useRef } from "react";
import { useMicVAD, utils } from "@ricky0123/vad-react";
import { ScrollShadow } from "@nextui-org/react";
import { LangObj, LanguageOptions } from "@/types/lang";
import LanguageSelection from "./LanguageSelection";
import { TranscriptionResponse, TranslationResponse } from "@/types/common";

export default function RealtimeTranslation() {
  const [translatedSubtitles, setTranslatedSubtitles] = useState("");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [languageSelected, setLanguageSelected] = useState<LangObj>({
    fromLanguage: LanguageOptions[0],
    toLanguage: LanguageOptions[3],
  });

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const subtitlesRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices
        .getUserMedia({ video: true })
        .then((stream) => {
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        })
        .catch((err) => console.error("Error accessing camera:", err));
    }
  }, []);

  useEffect(() => {
    if (subtitlesRef.current) {
      subtitlesRef.current.scrollTop = subtitlesRef.current.scrollHeight;
    }
  }, [translatedSubtitles]);

  const vad = useMicVAD({
    startOnLoad: true,
    onSpeechStart: () => setIsSpeaking(true),
    onSpeechEnd: (audio) => {
      setIsSpeaking(false);
      const wav = utils.encodeWAV(audio);
      const blob = new Blob([wav], { type: "audio/wav" });
      getTranscribe(blob, languageSelected);
    },
    workletURL: "/vad.worklet.bundle.min.js",
    modelURL: "/silero_vad.onnx",
    positiveSpeechThreshold: 0.9, // Higher sensitivity for detecting speech
    negativeSpeechThreshold: 0.1, // Lower sensitivity for detecting non-speech
    redemptionFrames: 3, // Quick transition to non-speech state
    frameSamples: 1536, // Default frame size
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
  ): Promise<void> => {
    const formData = new FormData();
    formData.append("audio", audioBlob, "audio.wav");
    formData.append("config", JSON.stringify(languageSelected));

    try {
      const response = await fetch("/api/subsirl", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Transcription request failed");
      }

      const result: TranscriptionResponse = await response.json();
      if (result.transcript.trim()) {
        await getTranslation(result.transcript, languageSelected);
      }
    } catch (error) {
      console.error("Error in transcription:", error);
    }
  };

  const getTranslation = async (
    text: string,
    languageSelected: LangObj
  ): Promise<void> => {
    const formData = new FormData();
    formData.append("text", text);
    formData.append("config", JSON.stringify(languageSelected));

    try {
      const response = await fetch("/api/scribe", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Translation request failed");
      }

      const result: TranslationResponse = await response.json();
      if (result.translation.trim()) {
        setTranslatedSubtitles((prev) => `${prev} ${result.translation}`);
      }
    } catch (error) {
      console.error("Error in translation:", error);
    }
  };

  return (
    <div className="relative h-screen w-full overflow-hidden bg-black belowShadow">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute top-0 left-0 w-full h-full object-cover"
      />

      <ScrollShadow
        ref={subtitlesRef}
        hideScrollBar
        className="absolute mb-4 bottom-0 left-0 max-h-[35vh] overflow-auto scrollbar-none w-full bg-black text-white p-8"
      >
        <p className=" text-2xl sm:text-3xl leading-relaxed sm:leading-loose ">
          {translatedSubtitles
            ?.replaceAll('"', "")
            .replaceAll(" .", ".")
            .replaceAll(" ,", ".")
            .replaceAll(" ?", "?")}
        </p>
      </ScrollShadow>

      <div
        className={`absolute top-4 flex justify-center items-center gap-2  w-full `}
      >
        <LanguageSelection
          languageSelected={languageSelected}
          setLanguageSelected={setLanguageSelected}
        />
      </div>
    </div>
  );
}
