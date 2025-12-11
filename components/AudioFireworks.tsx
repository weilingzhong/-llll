import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

// Configuration for visual aesthetics
const COLORS = [
  0x00BFFF, // Deep Sky Blue
  0x1E90FF, // Dodger Blue
  0xFF00FF, // Magenta
  0xFF69B4, // Hot Pink
  0xFFFF00, // Yellow
  0xFFFFFF, // White
  0x00FFFF, // Cyan
];

interface Particle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  color: THREE.Color;
  active: boolean;
  scaleDecay: number;
}

interface Rocket {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  targetHeight: number;
  active: boolean;
  color: THREE.Color;
  isHighFreq: boolean; // Determines explosion size
}

const AudioFireworks: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [debugInfo, setDebugInfo] = useState({ low: 0, mid: 0, high: 0 });
  
  // Refs for cleanup
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const analyserRef = useRef<THREE.AudioAnalyser | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const frameIdRef = useRef<number>(0);

  useEffect(() => {
    if (!containerRef.current) return;

    // --- 1. Three.js Setup ---
    const scene = new THREE.Scene();
    // Add some fog for depth
    scene.fog = new THREE.FogExp2(0x000000, 0.02);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 10, 30);
    camera.lookAt(0, 10, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x404040);
    scene.add(ambientLight);
    const pointLight = new THREE.PointLight(0xffffff, 1, 100);
    pointLight.position.set(0, 20, 10);
    scene.add(pointLight);

    // Floor (Reflective logic simulated with grid for retro feel)
    const gridHelper = new THREE.GridHelper(200, 50, 0x333333, 0x111111);
    scene.add(gridHelper);

    // --- 2. Audio Setup ---
    const listener = new THREE.AudioListener();
    camera.add(listener);

    const sound = new THREE.Audio(listener);
    const audioLoader = new THREE.AudioLoader();
    
    // We need an analyser but we connect it to mic stream later
    let analyser: THREE.AudioAnalyser | null = null;

    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      const context = listener.context;
      audioContextRef.current = context;
      const source = context.createMediaStreamSource(stream);
      
      // Connect source to analyser, but NOT to destination (speakers) to avoid feedback loop
      const analyserNode = context.createAnalyser();
      analyserNode.fftSize = 512; // Controls resolution
      source.connect(analyserNode);
      
      // Hack: Create a wrapper compatible with Three.js analyser interface if needed, 
      // or just use Three.js AudioAnalyser with a dummy sound object.
      // Better: Manually creating the Three.js Analyser wrapper
      analyser = new THREE.AudioAnalyser(sound, 512);
      analyser.analyser = analyserNode; // Override with mic source
      analyserRef.current = analyser;
    }).catch(err => console.error("Mic Error", err));

    // --- 3. Object Pooling for Performance ---
    const rockets: Rocket[] = [];
    const particles: Particle[] = [];
    
    // Geometry/Materials shared
    const rocketGeo = new THREE.SphereGeometry(0.3, 8, 8);
    const particleGeo = new THREE.PlaneGeometry(0.5, 0.5); // Sprites are cheaper
    
    // Helper to create texture for particles
    const getParticleTexture = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            const grad = ctx.createRadialGradient(16,16,0,16,16,16);
            grad.addColorStop(0, 'rgba(255,255,255,1)');
            grad.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = grad;
            ctx.fillRect(0,0,32,32);
        }
        const texture = new THREE.CanvasTexture(canvas);
        return texture;
    };
    
    const particleMat = new THREE.MeshBasicMaterial({
        map: getParticleTexture(),
        transparent: true,
        opacity: 1,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide
    });

    // --- 4. Logic Functions ---

    const launchRocket = (intensity: number, isHighFreq: boolean) => {
      // Find inactive rocket
      let rocket = rockets.find(r => !r.active);
      if (!rocket) {
        const mesh = new THREE.Mesh(rocketGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
        scene.add(mesh);
        rocket = {
          mesh,
          velocity: new THREE.Vector3(),
          targetHeight: 0,
          active: false,
          color: new THREE.Color(),
          isHighFreq: false
        };
        rockets.push(rocket);
      }

      const xPos = (Math.random() - 0.5) * 40;
      rocket.mesh.position.set(xPos, 0, (Math.random() - 0.5) * 10);
      rocket.active = true;
      rocket.isHighFreq = isHighFreq;
      
      // High Freq = Higher, Faster
      const heightBase = isHighFreq ? 25 : 10;
      const heightVar = isHighFreq ? 10 : 5;
      rocket.targetHeight = heightBase + Math.random() * heightVar;
      
      // Speed
      rocket.velocity.set(0, isHighFreq ? 0.8 : 0.4, 0);

      // Color selection
      const colorHex = COLORS[Math.floor(Math.random() * COLORS.length)];
      rocket.color.setHex(colorHex);
      (rocket.mesh.material as THREE.MeshBasicMaterial).color.copy(rocket.color);
      rocket.mesh.visible = true;
    };

    const explode = (position: THREE.Vector3, color: THREE.Color, isHighFreq: boolean) => {
        // High Freq = More particles, bigger spread
        const count = isHighFreq ? 150 : 30;
        const speed = isHighFreq ? 0.8 : 0.2;
        const life = isHighFreq ? 2.5 : 1.0; // Seconds

        for (let i = 0; i < count; i++) {
            let p = particles.find(pt => !pt.active);
            if (!p) {
                const mesh = new THREE.Mesh(particleGeo, particleMat.clone());
                scene.add(mesh);
                p = {
                    mesh,
                    velocity: new THREE.Vector3(),
                    life: 0,
                    maxLife: 0,
                    color: new THREE.Color(),
                    active: false,
                    scaleDecay: 0
                };
                particles.push(p);
            }

            p.active = true;
            p.mesh.position.copy(position);
            p.mesh.visible = true;
            p.mesh.lookAt(camera.position); // Billboard effect
            
            // Sphere random direction
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos((Math.random() * 2) - 1);
            const r = Math.random() * speed;
            
            p.velocity.set(
                r * Math.sin(phi) * Math.cos(theta),
                r * Math.sin(phi) * Math.sin(theta),
                r * Math.cos(phi)
            );

            p.color.copy(color);
            // Vibe check: Add white sparkles to high freq
            if (isHighFreq && Math.random() > 0.7) p.color.setHex(0xFFFFFF);
            
            (p.mesh.material as THREE.MeshBasicMaterial).color.copy(p.color);
            (p.mesh.material as THREE.MeshBasicMaterial).opacity = 1;
            
            p.life = life;
            p.maxLife = life;
            p.scaleDecay = isHighFreq ? 0.96 : 0.92;
            p.mesh.scale.set(1, 1, 1);
        }
    };

    // --- 5. Animation Loop ---
    const clock = new THREE.Clock();
    let timeSinceLastLaunch = 0;

    const animate = () => {
      frameIdRef.current = requestAnimationFrame(animate);
      const delta = Math.min(clock.getDelta(), 0.1); // Cap delta

      // Audio Analysis
      let bassAvg = 0;
      let midAvg = 0;
      let trebleAvg = 0;

      if (analyserRef.current) {
        const freqData = analyserRef.current.getFrequencyData();
        // freqData is usually 256 bins (half of fftSize)
        // 0-10: Sub bass
        // 10-40: Bass
        // 40-100: Mids
        // 100-255: Highs

        // Helper to avg
        const getAvg = (start: number, end: number) => {
            let sum = 0;
            for(let i=start; i<end; i++) sum += freqData[i];
            return sum / (end-start || 1);
        };

        bassAvg = getAvg(0, 10);   // Deep Lows
        midAvg = getAvg(10, 80);   // Mids
        trebleAvg = getAvg(80, 200); // Highs (Voices, snares)
        
        // Normalize 0-255 to 0-1 approx
        bassAvg /= 255;
        midAvg /= 255;
        trebleAvg /= 255;

        setDebugInfo({ 
            low: Math.round(bassAvg * 100), 
            mid: Math.round(midAvg * 100), 
            high: Math.round(trebleAvg * 100) 
        });
      }

      // Launch Logic
      timeSinceLastLaunch += delta;
      
      // Thresholds for launching
      // High Freq dominance -> Big fireworks
      if (trebleAvg > 0.4 && timeSinceLastLaunch > 0.1) {
          launchRocket(trebleAvg, true);
          timeSinceLastLaunch = 0;
      }
      // Low Freq dominance -> Small calm fireworks
      else if (bassAvg > 0.5 && timeSinceLastLaunch > 0.2) {
          launchRocket(bassAvg, false);
          timeSinceLastLaunch = 0;
      }
      // Random sporadic filler
      else if (timeSinceLastLaunch > 2.0) {
          launchRocket(0.5, false); // Keep the show alive if silent
          timeSinceLastLaunch = 0;
      }

      // Update Rockets
      rockets.forEach(r => {
          if (!r.active) return;
          
          r.mesh.position.add(r.velocity);
          
          // Apply gravity drag slightly
          r.velocity.y *= 0.98;

          if (r.mesh.position.y >= r.targetHeight || r.velocity.y < 0.1) {
              r.active = false;
              r.mesh.visible = false;
              explode(r.mesh.position, r.color, r.isHighFreq);
          }
      });

      // Update Particles
      particles.forEach(p => {
          if (!p.active) return;
          
          p.life -= delta;
          
          // Physics
          p.mesh.position.add(p.velocity);
          p.velocity.y -= 0.02; // Gravity
          p.velocity.multiplyScalar(0.95); // Air resistance
          
          // Visuals
          const ratio = p.life / p.maxLife;
          (p.mesh.material as THREE.MeshBasicMaterial).opacity = ratio;
          p.mesh.scale.multiplyScalar(p.scaleDecay);
          p.mesh.lookAt(camera.position); // Keep sprites facing camera

          if (p.life <= 0) {
              p.active = false;
              p.mesh.visible = false;
          }
      });
      
      // Camera gentle sway based on mid tones (energy)
      camera.position.x = Math.sin(clock.getElapsedTime() * 0.5) * 5;
      camera.lookAt(0, 15, 0);

      renderer.render(scene, camera);
    };

    animate();

    // Window Resize
    const handleResize = () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(frameIdRef.current);
      if (containerRef.current && rendererRef.current) {
        containerRef.current.removeChild(rendererRef.current.domElement);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="absolute inset-0" />
      
      {/* HUD / Debug Info */}
      <div className="absolute top-4 right-4 pointer-events-none bg-black/30 backdrop-blur rounded p-2 text-xs text-mono text-white border border-white/10">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 rounded-full bg-pink-500"></div>
          <span>Low (Calm): {debugInfo.low}%</span>
          <div className="w-16 h-1 bg-gray-700 rounded overflow-hidden">
            <div className="h-full bg-pink-500 transition-all duration-75" style={{ width: `${debugInfo.low}%` }}></div>
          </div>
        </div>
        <div className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 rounded-full bg-blue-500"></div>
          <span>Mid: {debugInfo.mid}%</span>
          <div className="w-16 h-1 bg-gray-700 rounded overflow-hidden">
            <div className="h-full bg-blue-500 transition-all duration-75" style={{ width: `${debugInfo.mid}%` }}></div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-yellow-400"></div>
          <span>High (Explosive): {debugInfo.high}%</span>
          <div className="w-16 h-1 bg-gray-700 rounded overflow-hidden">
            <div className="h-full bg-yellow-400 transition-all duration-75" style={{ width: `${debugInfo.high}%` }}></div>
          </div>
        </div>
      </div>
      
      <div className="absolute bottom-4 left-4 pointer-events-none text-white/50 text-sm font-light">
         Powered by Three.js & Web Audio API
      </div>
    </div>
  );
};

export default AudioFireworks;