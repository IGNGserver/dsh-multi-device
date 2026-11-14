import { useEffect, useRef } from 'react'

export function SpatialBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let width = 0
    let height = 0
    let rafId = 0

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = window.innerWidth
      height = window.innerHeight
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const drawStatic = (timeSec: number) => {
      ctx.clearRect(0, 0, width, height)

      // Subtle precision calibration grid
      const step = 64
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.042)'
      ctx.lineWidth = 1

      ctx.beginPath()
      for (let x = (width % step) / 2; x < width; x += step) {
        ctx.moveTo(x, 0)
        ctx.lineTo(x, height)
      }
      for (let y = (height % step) / 2; y < height; y += step) {
        ctx.moveTo(0, y)
        ctx.lineTo(width, y)
      }
      ctx.stroke()

      // Soft perspective horizon rays near top stage
      const cx = width * 0.5
      const cy = Math.min(height * 0.44, 420)
      const tones = [
        'rgba(122, 170, 255, 0.16)',
        'rgba(56, 189, 248, 0.14)',
        'rgba(245, 158, 11, 0.13)',
        'rgba(34, 197, 94, 0.13)',
      ]

      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2 + timeSec * 0.05
        const dist = 160 + ((timeSec * 36 + i * 75) % 360)
        const px = cx + Math.cos(angle) * dist * 1.45
        const py = cy + Math.sin(angle) * dist * 0.62

        ctx.fillStyle = tones[i % tones.length]
        ctx.beginPath()
        ctx.arc(px, py, 1.8, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    resize()
    window.addEventListener('resize', resize, { passive: true })

    if (reducedMotion) {
      drawStatic(0)
      return () => {
        window.removeEventListener('resize', resize)
      }
    }

    const tick = (nowMs: number) => {
      drawStatic(nowMs * 0.001)
      rafId = window.requestAnimationFrame(tick)
    }
    rafId = window.requestAnimationFrame(tick)

    return () => {
      window.cancelAnimationFrame(rafId)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return <canvas ref={canvasRef} className="spatial-backdrop" aria-hidden="true" />
}
