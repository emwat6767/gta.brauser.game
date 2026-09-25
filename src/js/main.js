import * as THREE from 'three';
import { CONFIG } from './config.js';
import { createRng } from './utils.js';
import { EventBus } from './events.js';
import { Input } from './input.js';
import { createTextures } from './textures.js';
import { World } from './world.js';
import { Player } from './player.js';
import { Vehicle } from './vehicle.js';
import { NPCManager } from './npc.js';
import { CameraRig } from './camera.js';
import { resolveInteractions } from './interactions.js';
import { HUD } from './ui/hud.js';
import { Minimap } from './ui/minimap.js';
import { TouchControls } from './ui/touch.js';
import { GangSystem } from './gangs.js';
import { WantedSystem } from './wanted.js';
import { RoadNetwork, TrafficManager } from './traffic.js';

// Точка входа. Game владеет всеми системами и крутит игровой цикл:
//   1. ввод камеры, E (сесть/выйти/угнать)
//   2. симуляция фиксированными подшагами:
//      player -> vehicles -> npcs -> gangs -> wanted -> traffic -> interactions
//   3. камера, солнце/тени, рендер, HUD, миникарта, сенсорные кнопки
//   4. "ПОТРАЧЕНО"/"АРЕСТОВАН" -> через несколько секунд возрождение
// Все системы получают ссылку на game и обращаются друг к другу через неё.

const SKY = { top: 0x3f86d8, horizon: 0xd3e2ec, bottom: 0xa7b3ba };
const IS_TOUCH = !!window.matchMedia?.('(pointer: coarse)').matches;
if (IS_TOUCH) {
  Object.assign(CONFIG.graphics, CONFIG.graphics.mobile);
  CONFIG.traffic.count = CONFIG.traffic.mobileCount;
}
const SUN_DIR = new THREE.Vector3(0.45, 0.8, 0.3).normalize();

class Game {
  constructor(container) {
    this.events = new EventBus();
    this.rng = createRng(CONFIG.seed);
    this._initRenderer(container);
    this._initScene();

    this.input = new Input(this.renderer.domElement);
    this.textures = createTextures(this.renderer);
    this.world = new World(this);
    this.player = new Player(this);
    this.vehicles = CONFIG.vehicle.spawns.map((spawn) => {
      const v = new Vehicle(this, spawn);
      v.persistent = true; // стартовые машины не убираются трафиком
      return v;
    });
    this.npcs = new NPCManager(this);
    this.roads = new RoadNetwork(this.world);
    this.gangs = new GangSystem(this);
    this.traffic = new TrafficManager(this);
    this.wanted = new WantedSystem(this);
    this.downState = null; // { kind: 'wasted' | 'busted', timer }
    this.cameraRig = new CameraRig(this);
    this.hud = new HUD(this);
    this.minimap = new Minimap(this);
    this.touch = new TouchControls(this);

    this.paused = true;
    this.clock = new THREE.Clock();
    window.addEventListener('resize', () => this._onResize());
  }

  _initRenderer(container) {
    const G = CONFIG.graphics;
    const r = new THREE.WebGLRenderer({ antialias: G.antialias, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, G.maxPixelRatio));
    r.setSize(window.innerWidth, window.innerHeight);
    r.shadowMap.enabled = true;
    r.shadowMap.type = G.softShadows ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    container.appendChild(r.domElement);
    this.renderer = r;
  }

  _initScene() {
    const C = CONFIG.camera, G = CONFIG.graphics;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(SKY.horizon, G.fogNear, G.fogFar);
    this.camera = new THREE.PerspectiveCamera(C.fov, window.innerWidth / window.innerHeight, C.near, C.far);

    // Небо: сфера с градиентом и солнцем, всегда вокруг камеры.
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(900, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          top: { value: new THREE.Color(SKY.top) },
          horizon: { value: new THREE.Color(SKY.horizon) },
          bottom: { value: new THREE.Color(SKY.bottom) },
          sunDir: { value: SUN_DIR },
        },
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; uniform vec3 sunDir;
          varying vec3 vDir;
          void main() {
            vec3 d = normalize(vDir);
            float h = d.y;
            vec3 c = h > 0.0 ? mix(horizon, top, pow(h, 0.55)) : mix(horizon, bottom, pow(-h, 0.4));
            float s = max(dot(d, sunDir), 0.0);
            c += vec3(1.0, 0.9, 0.7) * (pow(s, 900.0) * 6.0 + pow(s, 12.0) * 0.25);
            gl_FragColor = vec4(c, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      }),
    );
    this.sky.renderOrder = -1;
    this.scene.add(this.sky);

    // Отражения для краски и стёкол машин — из того же неба.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envScene = new THREE.Scene();
    envScene.add(new THREE.Mesh(this.sky.geometry, this.sky.material));
    this.envMap = pmrem.fromScene(envScene, 0, 0.1, 2000).texture;
    pmrem.dispose();

    this.scene.add(new THREE.HemisphereLight(0xd4e6ff, 0x5d5446, 1.15));
    const sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(G.shadowMapSize, G.shadowMapSize);
    const r = G.shadowRange;
    Object.assign(sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 1, far: 450 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.04;
    this.scene.add(sun, sun.target);
    this.sun = sun;
  }

  // Тень считается только в квадрате вокруг игрока — двигаем источник за ним.
  _updateSun() {
    const p = this.player.position;
    const texel = (CONFIG.graphics.shadowRange * 2) / CONFIG.graphics.shadowMapSize;
    const x = Math.round(p.x / texel) * texel;
    const z = Math.round(p.z / texel) * texel;
    this.sun.target.position.set(x, 0, z);
    this.sun.position.set(x + SUN_DIR.x * 220, SUN_DIR.y * 220, z + SUN_DIR.z * 220);
  }

  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  addVehicle(vehicle) {
    this.vehicles.push(vehicle);
    return vehicle;
  }

  // Убрать машину из мира (водителя-NPC убирает вызывающий код).
  removeVehicle(vehicle) {
    if (vehicle.driver === this.player) return;
    const i = this.vehicles.indexOf(vehicle);
    if (i >= 0) this.vehicles.splice(i, 1);
    vehicle.dispose();
  }

  // Игрок погиб или арестован: крупная надпись, через несколько секунд — возрождение.
  onPlayerDown(kind) {
    if (this.downState) return;
    this.downState = { kind, timer: CONFIG.player.respawnDelay };
    if (kind === 'wasted') this.hud.showBigMessage('ПОТРАЧЕНО', '#d32f2f');
    else this.hud.showBigMessage('АРЕСТОВАН', '#4f8dff');
    this.events.emit('player:down', { kind });
  }

  bustPlayer() {
    const p = this.player;
    if (p.isDead || this.downState) return;
    if (p.vehicle) p.exitVehicle();
    p.stun(CONFIG.player.respawnDelay + 1);
    this.onPlayerDown('busted');
  }

  _respawn() {
    const P = CONFIG.player;
    const point = this.downState.kind === 'wasted' ? P.hospital : P.policeStation;
    this.downState = null;
    this.wanted.clear();
    this.player.respawn(point);
    this.cameraRig.yaw = point.heading;
    this.cameraRig.initialized = false;
    this.hud.hideBigMessage();
    this.events.emit('player:respawn', { point });
  }

  _toggleVehicle() {
    const p = this.player;
    if (p.isDown || this.downState) return;
    if (p.vehicle) {
      p.exitVehicle();
    } else {
      const v = p.findEnterableVehicle();
      if (v) p.enterVehicle(v);
    }
  }

  // Один шаг симуляции. Порядок важен: сначала все двигаются, потом разрешаются столкновения.
  _simulate(dt) {
    this.player.update(dt);
    for (const v of this.vehicles) v.update(dt);
    this.npcs.update(dt);
    this.gangs.update(dt);
    this.wanted.update(dt);
    this.traffic.update(dt);
    resolveInteractions(this);
  }

  _frame() {
    const frameTime = Math.min(this.clock.getDelta(), CONFIG.physics.maxFrameTime);
    const input = this.input;

    if (input.wasPressed('toggleHelp')) this.hud.toggleHelp();
    if (!this.paused) {
      this.cameraRig.handleInput(frameTime);
      if (input.wasPressed('interact')) this._toggleVehicle();
      const steps = Math.max(1, Math.ceil(frameTime / CONFIG.physics.fixedStep - 0.01));
      const dt = frameTime / steps;
      for (let i = 0; i < steps; i++) this._simulate(dt);
      if (this.downState && (this.downState.timer -= frameTime) <= 0) this._respawn();
    }

    this.cameraRig.update(frameTime);
    this._updateSun();
    this.sky.position.copy(this.camera.position);
    this.renderer.render(this.scene, this.camera);
    this.hud.update(frameTime);
    this.minimap.update(frameTime);
    this.touch.update();
    input.endFrame();
  }

  start() {
    this.cameraRig.update(0);
    this.renderer.setAnimationLoop(() => this._frame());
  }

  pause() {
    this.paused = true;
    this.events.emit('game:pause');
  }

  resume() {
    this.paused = false;
    this.clock.getDelta();
    this.input.requestPointerLock();
    this.events.emit('game:resume');
  }
}

// ------------------------------------------------------------ Запуск + меню

const overlay = document.getElementById('overlay');
const status = document.getElementById('overlay-status');
const playButton = document.getElementById('play');

try {
  const game = new Game(document.getElementById('app'));
  window.game = game; // для отладки из консоли: game.player.position, game.vehicles...
  window.__gameReady = true;
  game.start();

  status.textContent = 'Город готов.';
  playButton.disabled = false;

  const showMenu = (paused) => {
    overlay.classList.toggle('hidden', !paused);
    playButton.textContent = game.started ? 'Продолжить' : 'Играть';
  };
  const play = () => {
    if (game.input.touchActive && !document.fullscreenElement) {
      // На телефоне — полноэкранный режим и альбомная ориентация, если браузер разрешит.
      Promise.resolve(document.documentElement.requestFullscreen?.())
        .then(() => window.screen.orientation?.lock?.('landscape'))
        .catch(() => {});
    }
    game.started = true;
    game.resume();
    showMenu(false);
  };
  playButton.addEventListener('click', play);
  game.events.on('game:pause', () => showMenu(true));

  let hadLock = false;
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement) hadLock = true;
    else if (hadLock && !game.paused) game.pause();
  });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && !game.paused) {
      document.exitPointerLock?.();
      game.pause();
    }
    if (e.code === 'Enter' && game.paused) play();
  });
  // Клик по игре без захвата мыши — повторно запросить pointer lock.
  game.renderer.domElement.addEventListener('click', () => {
    if (!game.paused && !document.pointerLockElement) game.input.requestPointerLock();
  });
} catch (err) {
  console.error(err);
  status.textContent = `Ошибка запуска: ${err.message}`;
}
