import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Camera, CheckCircle2, Cpu, Crosshair, RefreshCw, Video, AlertCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const neonCard = "border-cyan-400/30 bg-slate-950/70 shadow-[0_0_28px_rgba(34,211,238,0.10)]";

export default function WebcamTest() {
  const { isAuthenticated } = useAuth();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [visionPrompt, setVisionPrompt] = useState("Inspect this live webcam stream. Describe the clarity, resolution, lighting, objects, and any visible bottles or text labels.");
  const [resolution, setResolution] = useState("640x480");
  const [capturedSnapshots, setCapturedSnapshots] = useState<string[]>([]);

  const robots = trpc.robot.list.useQuery(undefined, { enabled: isAuthenticated, refetchInterval: 5000 });
  const state = trpc.robot.state.useQuery({ robotId: selectedId || 0 }, { enabled: Boolean(selectedId), refetchInterval: 1000 });

  const cameraMutation = trpc.ai.cameraQuestion.useMutation({
    onSuccess: data => toast.success("AI Vision analysis complete!"),
    onError: e => toast.error(`Vision AI Error: ${e.message}`),
  });

  useEffect(() => {
    const first = robots.data?.[0];
    if (!selectedId && first) setSelectedId(first.id);
  }, [robots.data, selectedId]);

  const robot = state.data as any;
  const liveFrame = robot?.cameraJpeg ? `data:image/jpeg;base64,${robot.cameraJpeg}` : null;
  const isCameraConnected = Boolean(robot?.telemetry?.cameraConnected ?? liveFrame);
  const cameraIndex = robot?.telemetry?.cameraIndex ?? 0;

  function takeSnapshot() {
    if (!liveFrame) return toast.error("No live webcam frame available to capture.");
    setCapturedSnapshots(prev => [liveFrame, ...prev.slice(0, 5)]);
    toast.success("Webcam snapshot captured!");
  }

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-[#05070d] text-slate-100 -m-4 p-4 md:p-7 relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 opacity-20 bg-[linear-gradient(rgba(34,211,238,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(236,72,153,.08)_1px,transparent_1px)] bg-[size:36px_36px]" />

        <div className="relative mx-auto max-w-[1400px] space-y-6">
          <header className="flex flex-col gap-3 border-b border-cyan-300/20 pb-5 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2 text-[11px] font-bold tracking-[.3em] text-pink-300">
                <Video className="h-3.5 w-3.5" /> HARDWARE DIAGNOSTICS // WEBCAM TEST BENCH
              </div>
              <h1 className="font-black text-3xl tracking-tight md:text-4xl">
                USB WEBCAM <span className="text-cyan-300 [text-shadow:0_0_18px_rgba(34,211,238,.65)]">TEST & CALIBRATION</span>
              </h1>
              <p className="mt-1 text-sm text-slate-400">
                Real-time webcam stream testing, vision resolution diagnostics, and AI vision verification.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Badge className={`border ${isCameraConnected ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300" : "border-pink-400/40 bg-pink-400/10 text-pink-300"}`}>
                {isCameraConnected ? "WEBCAM ONLINE" : "WEBCAM OFFLINE"}
              </Badge>
            </div>
          </header>

          <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
            {/* Main Live Stream Card */}
            <Card className={neonCard}>
              <CardHeader className="flex-row items-center justify-between pb-3">
                <CardTitle className="flex items-center gap-2 text-sm uppercase tracking-[.2em] text-cyan-200">
                  <Camera className="h-4 w-4" /> Live Webcam Feed (Pi USB Camera)
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Select value={resolution} onValueChange={setResolution}>
                    <SelectTrigger className="h-8 text-xs border-cyan-300/20 bg-black/40 text-cyan-200 w-32">
                      <SelectValue placeholder="Resolution" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-cyan-300/20 text-slate-200">
                      <SelectItem value="640x480">640x480 (VGA)</SelectItem>
                      <SelectItem value="1280x720">1280x720 (HD)</SelectItem>
                      <SelectItem value="1920x1080">1920x1080 (FHD)</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="outline" className="h-8 border-cyan-300/30 text-cyan-200 hover:bg-cyan-400/10" onClick={() => state.refetch()}>
                    <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="relative flex min-h-[400px] items-center justify-center overflow-hidden rounded-xl border border-cyan-300/20 bg-black">
                  {liveFrame ? (
                    <img src={liveFrame} alt="Raspberry Pi USB Webcam Live Feed" className="max-h-[520px] w-full object-contain" />
                  ) : (
                    <div className="max-w-md p-8 text-center space-y-3">
                      <AlertCircle className="mx-auto h-12 w-12 text-pink-400" />
                      <p className="font-bold text-lg text-pink-200">NO WEBCAM STREAM DETECTED</p>
                      <p className="text-sm text-slate-400">
                        Ensure a USB Webcam is plugged into your Raspberry Pi 5 USB port and the Python agent is active (`python pi_agent/agent.py`).
                      </p>
                      <p className="text-xs text-cyan-300/80 font-mono">CLI Command: python pi_agent/agent.py test-camera</p>
                    </div>
                  )}
                  <div className="absolute left-3 top-3 border border-cyan-300/40 bg-black/80 px-2.5 py-1 text-[10px] tracking-[.2em] text-cyan-200">
                    USB DEV: /dev/video{cameraIndex} · {resolution}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <Button className="border border-pink-300/40 bg-pink-500/20 text-pink-100 hover:bg-pink-500/30" onClick={takeSnapshot} disabled={!liveFrame}>
                    <Camera className="mr-2 h-4 w-4" /> Capture Snapshot
                  </Button>
                  <span className="text-xs text-slate-500">Live JPEG compression stream (~72% quality)</span>
                </div>
              </CardContent>
            </Card>

            {/* Diagnostics & AI Test Panel */}
            <div className="space-y-6">
              <Card className={neonCard}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm uppercase tracking-[.2em] text-cyan-200">
                    <Cpu className="h-4 w-4" /> Webcam Hardware Telemetry
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-2 text-xs">
                  {[
                    ["CAMERA INDEX", `Device /dev/video${cameraIndex}`],
                    ["CONNECTION STATUS", isCameraConnected ? "ONLINE" : "OFFLINE"],
                    ["FRAME RECEIVE", liveFrame ? "RECEIVING" : "WAITING"],
                    ["ACTIVE ROBOT", robot?.name || "NONE SELECTED"],
                    ["PI OUTBOUND LINK", robot?.status || "OFFLINE"],
                    ["VISION AI READY", "NVIDIA NEMOTRON VL"],
                  ].map(([label, val]) => (
                    <div className="border border-white/10 bg-black/40 p-3" key={label}>
                      <div className="text-[10px] tracking-widest text-slate-500">{label}</div>
                      <div className={`mt-1 font-bold ${val.includes("ONLINE") || val.includes("RECEIVING") || val.includes("NVIDIA") ? "text-emerald-300" : "text-cyan-200"}`}>{val}</div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className={neonCard}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm uppercase tracking-[.2em] text-pink-200">
                    <Crosshair className="h-4 w-4" /> Test AI Vision Inference
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Textarea
                    value={visionPrompt}
                    onChange={e => setVisionPrompt(e.target.value)}
                    className="min-h-[90px] border-cyan-300/20 bg-black/40 text-xs text-slate-200"
                  />
                  <Button
                    className="w-full bg-pink-500 text-white hover:bg-pink-400"
                    disabled={!selectedId || !liveFrame || cameraMutation.isPending}
                    onClick={() => selectedId && cameraMutation.mutate({ robotId: selectedId, prompt: visionPrompt })}
                  >
                    {cameraMutation.isPending ? "Analyzing Frame..." : "Run Vision AI Diagnostics"}
                  </Button>

                  {cameraMutation.data?.answer && (
                    <div className="mt-3 border border-cyan-300/30 bg-black/60 p-3 text-xs text-cyan-100 rounded">
                      <b className="text-pink-300 uppercase tracking-wider block mb-1">Vision AI Report:</b>
                      <p className="whitespace-pre-wrap">{cameraMutation.data.answer}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Captured Snapshots Gallery */}
          {capturedSnapshots.length > 0 && (
            <Card className={neonCard}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm uppercase tracking-[.2em] text-cyan-200">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" /> Test Session Snapshots
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {capturedSnapshots.map((snap, idx) => (
                    <div key={idx} className="border border-cyan-300/20 rounded-lg overflow-hidden bg-black">
                      <img src={snap} alt={`Webcam Snapshot ${idx + 1}`} className="w-full h-32 object-cover" />
                      <div className="p-2 text-[10px] text-slate-400 text-center border-t border-white/10">
                        Snapshot #{idx + 1}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
