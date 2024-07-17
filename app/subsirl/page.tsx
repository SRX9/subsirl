"use client";

import React, { useState, useEffect, useRef } from "react";
import { useMicVAD, utils } from "@ricky0123/vad-react";
interface TranscriptionResponse {
  transcript: string;
}

interface TranslationResponse {
  translation: string;
}
export default function RealtimeTranslation() {
  const [translatedSubtitles, setTranslatedSubtitles] = useState("");
  const [isSpeaking, setIsSpeaking] = useState(false);
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

  const vad = useMicVAD({
    startOnLoad: true,
    onSpeechStart: () => setIsSpeaking(true),
    onSpeechEnd: (audio) => {
      setIsSpeaking(false);
      const wav = utils.encodeWAV(audio);
      const blob = new Blob([wav], { type: "audio/wav" });
      getTranscribe(blob);
    },
    workletURL: "/vad.worklet.bundle.min.js",
    modelURL: "/silero_vad.onnx",
    positiveSpeechThreshold: 0.1,
    minSpeechFrames: 0,
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
  const getTranscribe = async (audioBlob: Blob): Promise<void> => {
    const formData = new FormData();
    formData.append("audio", audioBlob, "audio.wav");

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
        await getTranslation(result.transcript);
      }
    } catch (error) {
      console.error("Error in transcription:", error);
    }
  };

  const getTranslation = async (text: string): Promise<void> => {
    const formData = new FormData();
    formData.append("text", text);

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

      <div
        ref={subtitlesRef}
        className="absolute mb-4 bottom-0 left-0 max-h-[20vh] overflow-auto scrollbar-none w-full bg-black bg-opacity-50 text-white p-4 px-5"
      >
        <p className="text-2xl">{translatedSubtitles}</p>
      </div>

      <div
        className={`absolute top-4 right-4 px-4 py-2 rounded-full text-white ${
          isSpeaking ? "bg-red-500" : "bg-gray-500"
        }`}
      >
        {isSpeaking ? "Listening" : "Not listening"}
      </div>
    </div>
  );
}
