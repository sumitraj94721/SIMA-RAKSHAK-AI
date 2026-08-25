import { useRef, useState, useEffect } from "react";
import * as faceapi from "face-api.js";

export default function AuthPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [started, setStarted] = useState(false);
  const [loading, setLoading] = useState(true);

  // 🔥 Load AI models
  useEffect(() => {
    const loadModels = async () => {
      const MODEL_URL = "https://justadudewhohacks.github.io/face-api.js/models";

      await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
      await faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL);

      setLoading(false);
    };

    loadModels();
  }, []);

  // 🎥 Start Camera
  const startCamera = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
    setStarted(true);
  };

  // 🔍 Detect Faces + Emotion
  const detect = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    const detections = await faceapi
      .detectAllFaces(videoRef.current, new faceapi.TinyFaceDetectorOptions())
      .withFaceExpressions();

    const canvas = canvasRef.current;
    const displaySize = {
      width: videoRef.current.videoWidth,
      height: videoRef.current.videoHeight,
    };

    faceapi.matchDimensions(canvas, displaySize);

    const resized = faceapi.resizeResults(detections, displaySize);

    const ctx = canvas.getContext("2d");
    ctx?.clearRect(0, 0, canvas.width, canvas.height);

    faceapi.draw.drawDetections(canvas, resized);
    faceapi.draw.drawFaceExpressions(canvas, resized);

    // 🔊 Alert if angry/sad
    resized.forEach((d: any) => {
      const expressions = d.expressions;
      const topEmotion = Object.keys(expressions).reduce((a, b) =>
        expressions[a] > expressions[b] ? a : b
      );

      if (topEmotion === "angry" || topEmotion === "sad") {
        const audio = new Audio("https://www.soundjay.com/button/beep-01a.mp3");
        audio.play();
      }
    });
  };

  // 🔄 Auto detect loop
  useEffect(() => {
    let interval: any;

    if (started) {
      interval = setInterval(() => {
        detect();
      }, 1500);
    }

    return () => clearInterval(interval);
  }, [started]);

  // 🧾 UI
  return (
    <div style={{
      height: "100vh",
      background: "#020617",
      color: "white",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      flexDirection: "column"
    }}>
      <h1>AI Security Camera</h1>

      {loading ? (
        <p>Loading AI Models...</p>
      ) : !started ? (
        <button onClick={startCamera} style={{padding:"10px 20px"}}>
          Start Camera
        </button>
      ) : (
        <>
          <div style={{ position: "relative" }}>
            <video
              ref={videoRef}
              autoPlay
              muted
              width="500"
              style={{ borderRadius: "10px" }}
            />
            <canvas
              ref={canvasRef}
              width="500"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}