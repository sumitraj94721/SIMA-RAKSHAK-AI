import { useRef, useState } from "react";

export default function CameraPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [result, setResult] = useState<any>(null);

  const startCamera = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    if (videoRef.current) videoRef.current.srcObject = stream;
  };

  const detect = async () => {
    const video = videoRef.current!;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    ctx.drawImage(video, 0, 0);

    const image = canvas.toDataURL("image/jpeg");

    const res = await fetch("http://127.0.0.1:8000/detect", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({ image }),
    });

    const data = await res.json();
    setResult(data);
  };

  return (
    <div style={{padding:"20px",color:"white",background:"#020617",height:"100vh"}}>
      <h2>Camera Dashboard</h2>

      <button onClick={startCamera}>Start Camera</button>
      <button onClick={detect} style={{marginLeft:"10px"}}>Detect</button>

      <br/><br/>

      <video ref={videoRef} autoPlay style={{width:"400px"}}/>
      <canvas ref={canvasRef} style={{display:"none"}}/>

      {result && (
        <div>
          <h3>Status: {result.status}</h3>
          <p>Faces: {result.faces}</p>
          <p>Emotion: {result.emotion}</p>
          <p>Confidence: {result.confidence}</p>
        </div>
      )}
    </div>
  );
}