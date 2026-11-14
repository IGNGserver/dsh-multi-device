import { getCopy } from '../data/copy'
import type { Locale } from '../types'

interface ArchitectureSectionProps {
  readonly locale: Locale
}

export function ArchitectureSection({ locale }: ArchitectureSectionProps) {
  const t = getCopy(locale).architecture

  return (
    <section id="architecture" className="section-block">
      <div className="container">
        <div className="section-header">
          <div className="section-eyebrow">{t.eyebrow}</div>
          <h2 className="section-title">{t.title}</h2>
          <p className="section-subtitle">{t.subtitle}</p>
        </div>

        {/* End-to-End Loopback Topology Diagram */}
        <div className="topology-diagram">
          <div className="topology-grid">
            <div className="topology-node">
              <div className="pillar-tag">
                {locale === 'zh'
                  ? '控制机 · DSH DESKTOP / WEB HOST'
                  : 'CONTROLLER HOST · DSH DESKTOP / WEB'}
              </div>
              <strong style={{ fontSize: 15 }}>
                {locale === 'zh'
                  ? '常驻 42px 标签条 + Keep-Alive 视图栈'
                  : 'Persistent 42px Tab Strip + Keep-Alive Frame Stack'}
              </strong>
              <div
                style={{
                  fontSize: 12.5,
                  color: 'var(--dsw-alias-label-secondary)',
                  lineHeight: 1.55,
                }}
              >
                {locale === 'zh'
                  ? '「本机」直接显示未经改动的宿主 DOM；每台远端挂载于独立本地环回反向代理 http://127.0.0.1:<proxyPort>/，不向本地会话控制器注入外部状态。'
                  : '"This Device" renders the untouched Host DOM; each remote mounts a dedicated http://127.0.0.1:<proxyPort>/ frame with zero foreign session injection.'}
              </div>
            </div>

            <div className="topology-bridge-col">
              <div className="topology-pipe">
                Channel A · $events + HTTP
                <div style={{ color: '#86efac', marginTop: 2 }}>
                  Epoch-fenced Attention
                </div>
              </div>
              <div className="topology-pipe">
                Channel B · system-ssh -L
                <div style={{ color: '#9ec0ff', marginTop: 2 }}>
                  127.0.0.1:&lt;local&gt; → 127.0.0.1:3080
                </div>
              </div>
            </div>

            <div className="topology-node">
              <div className="pillar-tag">
                {locale === 'zh'
                  ? '远端开发机矩阵 · ZERO REMOTE PLUGIN'
                  : 'REMOTE FLEET · ZERO REMOTE PLUGIN'}
              </div>
              <strong style={{ fontSize: 15 }}>
                {locale === 'zh'
                  ? '原生官方 dsh web（仅环回监听 127.0.0.1）'
                  : 'Stock Official dsh web (127.0.0.1 Loopback Only)'}
              </strong>
              <div
                style={{
                  fontSize: 12.5,
                  color: 'var(--dsw-alias-label-secondary)',
                  lineHeight: 1.55,
                }}
              >
                {locale === 'zh'
                  ? '远端 Linux 开发机、GPU 节点与 macOS 构建机无需安装本插件，也无需开放公网端口；仓库文件、终端与模型配置严格留在各自机器。'
                  : 'Remote Linux boxes, GPU servers, and CI runners need zero plugins and zero public ports; workspaces, terminals, and models stay strictly local to each host.'}
              </div>
            </div>
          </div>
        </div>

        {/* 3 Engineering Pillars */}
        <div className="pillars-grid">
          {t.pillars.map((pillar) => (
            <article key={pillar.tag} className="pillar-card">
              <div>
                <div className="pillar-tag">{pillar.tag}</div>
                <h3 className="pillar-title">{pillar.title}</h3>
                <p className="pillar-summary">{pillar.summary}</p>
                <ul className="pillar-list">
                  {pillar.points.map((pt, idx) => (
                    <li key={idx}>{pt}</li>
                  ))}
                </ul>
              </div>
              <pre className="pillar-code">{pillar.code}</pre>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
