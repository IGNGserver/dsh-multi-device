import gsap from 'gsap'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getCopy } from '../data/copy'
import type { DeviceRecord, Locale } from '../types'
import { formatCountCell, summarizeDeviceAttention } from '../utils/attention'
import { GlobeIcon, SettingsIcon } from './Icons'
import { MiniDshWindow } from './MiniDshWindow'

interface ConvergenceStageProps {
  readonly devices: readonly DeviceRecord[]
  readonly locale: Locale
}

interface Pose3D {
  readonly x: number
  readonly y: number
  readonly z: number
  readonly rotateX: number
  readonly rotateY: number
  readonly rotateZ: number
  readonly scale: number
  readonly opacity: number
  readonly blur: number
}

const SCATTER_CONSTELLATION: readonly Pose3D[] = [
  {
    x: -228,
    y: -86,
    z: 36,
    rotateX: 7,
    rotateY: 13,
    rotateZ: -1.8,
    scale: 0.47,
    opacity: 1,
    blur: 0,
  },
  {
    x: 228,
    y: -90,
    z: -16,
    rotateX: 8,
    rotateY: -14,
    rotateZ: 1.9,
    scale: 0.46,
    opacity: 0.97,
    blur: 0.3,
  },
  {
    x: -224,
    y: 94,
    z: -32,
    rotateX: -6,
    rotateY: 12,
    rotateZ: 1.5,
    scale: 0.46,
    opacity: 0.96,
    blur: 0.4,
  },
  {
    x: 228,
    y: 92,
    z: -56,
    rotateX: -7,
    rotateY: -13,
    rotateZ: -1.7,
    scale: 0.45,
    opacity: 0.94,
    blur: 0.6,
  },
]

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

function computeWindowPose(
  index: number,
  isFront: boolean,
  progress: number,
  compactMobile: boolean,
): Pose3D {
  if (compactMobile) {
    // Clean scaled constellation -> snapped transition for narrow viewports
    const mobileScatter: Pose3D = {
      x: (index % 2 === 0 ? -1 : 1) * 56,
      y: (index < 2 ? -1 : 1) * 48,
      z: -index * 30,
      rotateX: 6,
      rotateY: (index % 2 === 0 ? 1 : -1) * 8,
      rotateZ: 0,
      scale: 0.72,
      opacity: isFront ? 1 : 0.78,
      blur: 0,
    }
    const tSnap = smoothstep(0.15, 0.92, progress)
    return {
      x: lerp(mobileScatter.x, 0, tSnap),
      y: lerp(mobileScatter.y, 0, tSnap),
      z: lerp(mobileScatter.z, isFront ? 0 : -20, tSnap),
      rotateX: lerp(mobileScatter.rotateX, 0, tSnap),
      rotateY: lerp(mobileScatter.rotateY, 0, tSnap),
      rotateZ: 0,
      scale: lerp(mobileScatter.scale, 1, tSnap),
      opacity: progress > 0.84 ? (isFront ? 1 : 0) : mobileScatter.opacity,
      blur: 0,
    }
  }

  const scatter = SCATTER_CONSTELLATION[index] ?? SCATTER_CONSTELLATION[0]

  // Midpoint 1 (progress ~ 0.38): Tunnel Lock inward convergence
  const alignPose: Pose3D = {
    x: scatter.x * 0.52,
    y: scatter.y * 0.48,
    z: scatter.z * 0.6,
    rotateX: scatter.rotateX * 0.55,
    rotateY: scatter.rotateY * 0.55,
    rotateZ: scatter.rotateZ * 0.4,
    scale: 0.63,
    opacity: 0.98,
    blur: 0,
  }

  // Midpoint 2 (progress ~ 0.72): Isometric Keep-Alive Z-Stack
  const depthRank = isFront ? 0 : index === 0 ? 1 : index
  const stackPose: Pose3D = {
    x: (depthRank - 1.2) * 14,
    y: 22 - depthRank * 18,
    z: -depthRank * 68,
    rotateX: 9,
    rotateY: -6,
    rotateZ: 0,
    scale: 0.87,
    opacity: isFront ? 1 : Math.max(0.45, 0.92 - depthRank * 0.16),
    blur: isFront ? 0 : depthRank * 0.45,
  }

  // Endpoint (progress = 1.0): Magnetically snapped unified frame
  const snappedPose: Pose3D = {
    x: 0,
    y: 0,
    z: isFront ? 0 : -14,
    rotateX: 0,
    rotateY: 0,
    rotateZ: 0,
    scale: 1,
    opacity: isFront ? 1 : 0,
    blur: 0,
  }

  if (progress <= 0.38) {
    const t = smoothstep(0, 0.38, progress)
    return {
      x: lerp(scatter.x, alignPose.x, t),
      y: lerp(scatter.y, alignPose.y, t),
      z: lerp(scatter.z, alignPose.z, t),
      rotateX: lerp(scatter.rotateX, alignPose.rotateX, t),
      rotateY: lerp(scatter.rotateY, alignPose.rotateY, t),
      rotateZ: lerp(scatter.rotateZ, alignPose.rotateZ, t),
      scale: lerp(scatter.scale, alignPose.scale, t),
      opacity: lerp(scatter.opacity, alignPose.opacity, t),
      blur: lerp(scatter.blur, alignPose.blur, t),
    }
  }

  if (progress <= 0.74) {
    const t = smoothstep(0.38, 0.74, progress)
    return {
      x: lerp(alignPose.x, stackPose.x, t),
      y: lerp(alignPose.y, stackPose.y, t),
      z: lerp(alignPose.z, stackPose.z, t),
      rotateX: lerp(alignPose.rotateX, stackPose.rotateX, t),
      rotateY: lerp(alignPose.rotateY, stackPose.rotateY, t),
      rotateZ: lerp(alignPose.rotateZ, stackPose.rotateZ, t),
      scale: lerp(alignPose.scale, stackPose.scale, t),
      opacity: lerp(alignPose.opacity, stackPose.opacity, t),
      blur: lerp(alignPose.blur, stackPose.blur, t),
    }
  }

  const t = smoothstep(0.74, 0.96, progress)
  return {
    x: lerp(stackPose.x, snappedPose.x, t),
    y: lerp(stackPose.y, snappedPose.y, t),
    z: lerp(stackPose.z, snappedPose.z, t),
    rotateX: lerp(stackPose.rotateX, snappedPose.rotateX, t),
    rotateY: lerp(stackPose.rotateY, snappedPose.rotateY, t),
    rotateZ: lerp(stackPose.rotateZ, snappedPose.rotateZ, t),
    scale: lerp(stackPose.scale, snappedPose.scale, t),
    opacity: lerp(stackPose.opacity, snappedPose.opacity, t),
    blur: lerp(stackPose.blur, snappedPose.blur, t),
  }
}

export function ConvergenceStage({ devices, locale }: ConvergenceStageProps) {
  const copy = getCopy(locale)
  const stageDevices = useMemo(() => devices.slice(0, 4), [devices])

  const trackRef = useRef<HTMLDivElement | null>(null)
  const sceneRef = useRef<HTMLDivElement | null>(null)
  const cardRefs = useRef<(HTMLDivElement | null)[]>([])
  const topStripRef = useRef<HTMLDivElement | null>(null)
  const conduitGroupRef = useRef<SVGGElement | null>(null)

  const progressStateRef = useRef({ value: 0 })
  const pointerTiltRef = useRef({ rx: 0, ry: 0 })

  const [activePhase, setActivePhase] = useState(0)
  const [progressPct, setProgressPct] = useState(0)
  const [isSnapped, setIsSnapped] = useState(false)
  const [frontDeviceId, setFrontDeviceId] = useState('__local__')
  const [isMobileLayout, setIsMobileLayout] = useState(false)

  const applySceneTransforms = useCallback(
    (p: number) => {
      const compact = window.innerWidth <= 860
      stageDevices.forEach((dev, idx) => {
        const el = cardRefs.current[idx]
        if (!el) return
        const isFront = dev.id === frontDeviceId
        const pose = computeWindowPose(idx, isFront, p, compact)
        el.style.transform = `translate3d(${pose.x.toFixed(2)}px, ${pose.y.toFixed(2)}px, ${pose.z.toFixed(2)}px) rotateX(${pose.rotateX.toFixed(2)}deg) rotateY(${pose.rotateY.toFixed(2)}deg) rotateZ(${pose.rotateZ.toFixed(2)}deg) scale(${pose.scale.toFixed(4)})`
        el.style.opacity = pose.opacity.toFixed(3)
        el.style.filter =
          pose.blur > 0.08 ? `blur(${pose.blur.toFixed(2)}px)` : 'none'
        el.style.zIndex = isFront ? '18' : String(14 - idx)
        el.style.pointerEvents =
          p > 0.86 && !isFront ? 'none' : 'auto'
      })

      if (topStripRef.current) {
        const barReveal = smoothstep(0.78, 0.95, p)
        topStripRef.current.style.opacity = barReveal.toFixed(3)
        topStripRef.current.style.transform = `translate3d(0px, ${((1 - barReveal) * -18).toFixed(1)}px, 14px)`
        topStripRef.current.style.pointerEvents =
          barReveal > 0.8 ? 'auto' : 'none'
      }

      if (conduitGroupRef.current) {
        const conduitAlpha =
          p < 0.85 ? 0.25 + smoothstep(0.08, 0.45, p) * 0.75 : 1 - smoothstep(0.85, 0.98, p)
        conduitGroupRef.current.style.opacity = conduitAlpha.toFixed(3)
      }

      if (sceneRef.current) {
        const dampen = 1 - smoothstep(0.75, 0.98, p) * 0.75
        const rx = pointerTiltRef.current.rx * dampen
        const ry = pointerTiltRef.current.ry * dampen
        sceneRef.current.style.transform = `rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`
      }

      const phaseIdx =
        p < 0.24 ? 0 : p < 0.56 ? 1 : p < 0.86 ? 2 : 3
      setActivePhase((prev) => (prev === phaseIdx ? prev : phaseIdx))
      const rounded = Math.round(p * 100)
      setProgressPct((prev) => (prev === rounded ? prev : rounded))
      const snappedNow = p >= 0.88
      setIsSnapped((prev) => (prev === snappedNow ? prev : snappedNow))
    },
    [frontDeviceId, stageDevices],
  )

  useEffect(() => {
    const checkViewport = () => {
      const mobile = window.innerWidth <= 860
      setIsMobileLayout(mobile)
      if (mobile && window.scrollY < 40) {
        progressStateRef.current.value = 0
      }
      applySceneTransforms(progressStateRef.current.value)
    }
    checkViewport()

    const handleScroll = () => {
      if (window.innerWidth <= 860) return
      const track = trackRef.current
      if (!track) return
      const rect = track.getBoundingClientRect()
      const stickyOffset = 64
      const scrollable = Math.max(1, rect.height - (window.innerHeight - stickyOffset))
      const raw = clamp01((stickyOffset - rect.top) / scrollable)

      gsap.to(progressStateRef.current, {
        value: raw,
        duration: 0.22,
        ease: 'power2.out',
        overwrite: true,
        onUpdate: () => {
          applySceneTransforms(progressStateRef.current.value)
        },
      })
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', checkViewport, { passive: true })
    handleScroll()

    return () => {
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', checkViewport)
    }
  }, [applySceneTransforms])

  useEffect(() => {
    applySceneTransforms(progressStateRef.current.value)
  }, [frontDeviceId, locale, applySceneTransforms])

  const jumpToPhase = (phaseId: number) => {
    const targets = [0, 0.38, 0.72, 1]
    const targetP = targets[phaseId] ?? 0

    if (window.innerWidth <= 860 || !trackRef.current) {
      gsap.to(progressStateRef.current, {
        value: targetP,
        duration: 0.55,
        ease: 'power3.out',
        overwrite: true,
        onUpdate: () => applySceneTransforms(progressStateRef.current.value),
      })
      return
    }

    const track = trackRef.current
    const rect = track.getBoundingClientRect()
    const trackTopAbs = window.scrollY + rect.top
    const stickyOffset = 64
    const scrollable = Math.max(1, rect.height - (window.innerHeight - stickyOffset))
    const targetScrollY = trackTopAbs - stickyOffset + targetP * scrollable

    window.scrollTo({
      top: targetScrollY,
      behavior: 'smooth',
    })
  }

  const handlePointerMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isMobileLayout) return
    const rect = e.currentTarget.getBoundingClientRect()
    const nx = (e.clientX - rect.left) / rect.width - 0.5
    const ny = (e.clientY - rect.top) / rect.height - 0.5
    pointerTiltRef.current = {
      rx: -ny * 4.5,
      ry: nx * 5.5,
    }
    applySceneTransforms(progressStateRef.current.value)
  }

  const handlePointerLeave = () => {
    pointerTiltRef.current = { rx: 0, ry: 0 }
    applySceneTransforms(progressStateRef.current.value)
  }

  const hudText =
    activePhase === 0
      ? copy.hero.hudTelemetry.scattered
      : activePhase === 1
        ? copy.hero.hudTelemetry.aligning
        : activePhase === 2
          ? copy.hero.hudTelemetry.stacking
          : copy.hero.hudTelemetry.snapped

  return (
    <section id="top" className="hero-section">
      <div className="hero-header">
        <div className="eyebrow-pill">
          <span className="eyebrow-dot" />
          <span>{copy.hero.eyebrow}</span>
        </div>

        <h1 className="hero-title">
          {copy.hero.titleLine1}
          <br />
          <span className="hero-title-accent">{copy.hero.titleLine2}</span>
        </h1>

        <p className="hero-subtitle">{copy.hero.subtitle}</p>

        <div className="hero-cta-row">
          <a href="#workbench" className="btn-hero-primary">
            <span>{copy.hero.ctaInteractive}</span>
          </a>
          <a href="#install" className="btn-hero-secondary">
            <span>{copy.hero.ctaInstall}</span>
          </a>
          <a href="#architecture" className="btn-hero-tertiary">
            <span>{copy.hero.ctaArch}</span>
          </a>
        </div>
      </div>

      <div
        id="convergence"
        ref={trackRef}
        className="convergence-track"
        data-testid="convergence-track"
      >
        <div className="convergence-sticky">
          <div className="convergence-hud-top container">
            <div className="phase-stepper" role="tablist" aria-label="Convergence phases">
              {copy.hero.phases.map((ph) => (
                <button
                  key={ph.id}
                  type="button"
                  role="tab"
                  aria-selected={activePhase === ph.id}
                  className="phase-step-btn"
                  data-active={activePhase === ph.id ? 'true' : 'false'}
                  data-testid={`phase-btn-${ph.id}`}
                  onClick={() => jumpToPhase(ph.id)}
                >
                  <span className="phase-code">{ph.code}</span>
                  <span className="phase-label">{ph.label}</span>
                </button>
              ))}
            </div>

            <div className="hud-telemetry-banner">
              <span className="hud-progress-pill tabular-nums" data-testid="convergence-pct">
                {progressPct}%
              </span>
              <span>{hudText}</span>
            </div>
          </div>

          <div
            className="convergence-arena"
            onMouseMove={handlePointerMove}
            onMouseLeave={handlePointerLeave}
          >
            <div
              ref={sceneRef}
              className="convergence-scene-3d"
              data-testid="convergence-scene"
            >
              {/* Luminous SSH Loopback Conduits */}
              <svg
                className="tunnel-conduits-svg"
                viewBox="0 0 1200 620"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <defs>
                  <linearGradient id="conduit-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="rgba(56, 189, 248, 0)" />
                    <stop offset="50%" stopColor="rgba(122, 170, 255, 0.9)" />
                    <stop offset="100%" stopColor="rgba(245, 158, 11, 0)" />
                  </linearGradient>
                </defs>
                <g ref={conduitGroupRef}>
                  <path
                    className="conduit-base"
                    d="M 210 140 C 420 140, 460 300, 600 310"
                  />
                  <path
                    className="conduit-pulse"
                    d="M 210 140 C 420 140, 460 300, 600 310"
                  />

                  <path
                    className="conduit-base"
                    d="M 990 135 C 780 135, 740 300, 600 310"
                  />
                  <path
                    className="conduit-pulse"
                    d="M 990 135 C 780 135, 740 300, 600 310"
                  />

                  <path
                    className="conduit-base"
                    d="M 220 480 C 420 480, 470 320, 600 310"
                  />
                  <path
                    className="conduit-pulse"
                    d="M 220 480 C 420 480, 470 320, 600 310"
                  />

                  <path
                    className="conduit-base"
                    d="M 990 480 C 780 480, 730 320, 600 310"
                  />
                  <path
                    className="conduit-pulse"
                    d="M 990 480 C 780 480, 730 320, 600 310"
                  />
                </g>
              </svg>

              {/* Converged Top 42px Native Tab Strip (locks on in Phase 04) */}
              <div ref={topStripRef} className="converged-top-strip">
                <div className="dsh-md-native-bar">
                  <div className="dsh-md-native-tabs">
                    {stageDevices.map((dev) => {
                      const summary = summarizeDeviceAttention(dev)
                      const active = dev.id === frontDeviceId
                      const tabName = dev.isLocal
                        ? copy.workbench.nativeBar.localTab
                        : dev.name
                      return (
                        <div
                          key={dev.id}
                          className="dsh-md-tab-pill"
                          data-active={active ? 'true' : 'false'}
                          onClick={() => setFrontDeviceId(dev.id)}
                          style={{ cursor: 'pointer' }}
                        >
                          <button
                            type="button"
                            className="dsh-md-tab-trigger"
                            onClick={() => setFrontDeviceId(dev.id)}
                          >
                            {dev.isLocal && <GlobeIcon size={13} />}
                            <span className="dsh-md-tab-name">{tabName}</span>
                          </button>
                          {summary.segments.length > 0 && (
                            <span className="dsh-md-tab-status">
                              {summary.segments.map((seg) => (
                                <span
                                  key={seg.tone}
                                  className="dsh-md-tab-status-part"
                                  data-tone={seg.tone}
                                >
                                  {formatCountCell(seg.count)}
                                </span>
                              ))}
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  <div className="dsh-md-native-actions">
                    <span className="dsh-md-icon-btn" aria-hidden="true">
                      <SettingsIcon size={14} />
                    </span>
                  </div>
                </div>
              </div>

              <div
                className="converged-dock-shell"
                data-snapped={isSnapped ? 'true' : 'false'}
              />

              {/* 4 Independent Spatial DSH Windows */}
              {stageDevices.map((dev, idx) => (
                <MiniDshWindow
                  key={dev.id}
                  ref={(el) => {
                    cardRefs.current[idx] = el
                  }}
                  device={dev}
                  locale={locale}
                  localLabel={copy.workbench.nativeBar.localTab}
                  isFront={dev.id === frontDeviceId}
                  dockedPaddingTop={isSnapped ? 42 : 0}
                  showFloatingTag={!isSnapped}
                  onSelect={() => setFrontDeviceId(dev.id)}
                />
              ))}
            </div>
          </div>

          <div className="convergence-hud-bottom">
            <span>{copy.hero.scrollHint}</span>
          </div>
        </div>
      </div>
    </section>
  )
}
