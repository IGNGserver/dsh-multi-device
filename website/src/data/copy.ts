import type { Locale } from '../types'

export const RELEASE_VERSION = 'v0.3.6'
export const RELEASE_TAG_URL =
  'https://github.com/IGNGserver/dsh-multi-device/releases/tag/v0.3.6'
export const RELEASE_TGZ_URL =
  'https://github.com/IGNGserver/dsh-multi-device/releases/download/v0.3.6/dsh-multi-device-v0.3.6.tgz'
export const REPO_URL = 'https://github.com/IGNGserver/dsh-multi-device'

export interface SiteCopy {
  readonly brand: string
  readonly brandTag: string
  readonly nav: {
    readonly workbench: string
    readonly features: string
    readonly guarantees: string
    readonly install: string
    readonly architecture: string
    readonly github: string
    readonly cta: string
    readonly themeLabel: string
    readonly themeOptions: {
      readonly system: string
      readonly light: string
      readonly dark: string
    }
    readonly localeToggle: string
  }
  readonly hero: {
    readonly eyebrow: string
    readonly title: string
    readonly subtitle: string
    readonly primaryCta: string
    readonly secondaryCta: string
    readonly modeConverged: string
    readonly modeScattered: string
    readonly modeConvergedHint: string
    readonly modeScatteredHint: string
    readonly clickToDockHint: string
    readonly dockThisWindow: string
  }
  readonly connectionStrip: {
    readonly badge: string
    readonly summary: string
    readonly tip: string
  }
  readonly workbench: {
    readonly taskbarLabel: string
    readonly addDeviceTooltip: string
    readonly sidebarTitle: string
    readonly sidebarNewChat: string
    readonly activeTaskBanner: string
    readonly approvalPromptLabel: string
    readonly approveAllow: string
    readonly approveDeny: string
    readonly approvedNotice: string
    readonly deniedNotice: string
    readonly draftSavedNote: string
    readonly placeholder: string
    readonly sendAria: string
    readonly modelChip: string
    readonly agentChip: string
    readonly simulatedStreamReply: (prompt: string) => string
    readonly simulatedStreamFinal: string
    readonly attentionMenuTitle: string
    readonly attentionGroups: {
      readonly pending: string
      readonly running: string
      readonly done: string
    }
    readonly offlineBanner: string
    readonly reconnectBtn: string
    readonly settingsModal: {
      readonly title: string
      readonly subtitle: string
      readonly sshAutoDiscovery: string
      readonly quickImportBtn: string
      readonly importedTag: string
      readonly remoteSetupNote: string
      readonly closeBtn: string
    }
  }
  readonly features: {
    readonly eyebrow: string
    readonly title: string
    readonly subtitle: string
    readonly cards: readonly {
      readonly tag: string
      readonly title: string
      readonly body: string
    }[]
  }
  readonly guarantees: {
    readonly eyebrow: string
    readonly title: string
    readonly subtitle: string
    readonly items: readonly {
      readonly badge: string
      readonly title: string
      readonly body: string
    }[]
  }
  readonly install: {
    readonly eyebrow: string
    readonly title: string
    readonly subtitle: string
    readonly urlLabel: string
    readonly copyBtn: string
    readonly copiedBtn: string
    readonly releasesLink: string
    readonly steps: readonly {
      readonly num: string
      readonly title: string
      readonly body: string
    }[]
    readonly cliPanelTitle: string
    readonly cliDesktopLabel: string
    readonly cliWebLabel: string
    readonly checklistPanelTitle: string
    readonly checklistItems: readonly {
      readonly question: string
      readonly answer: string
    }[]
  }
  readonly architecture: {
    readonly eyebrow: string
    readonly panelTitle: string
    readonly panelSummary: string
    readonly items: readonly {
      readonly title: string
      readonly body: string
    }[]
  }
  readonly footer: {
    readonly note: string
    readonly license: string
    readonly repo: string
    readonly releases: string
  }
}

export const SITE_COPY: Record<Locale, SiteCopy> = {
  zh: {
    brand: 'dsh-multi-device',
    brandTag: RELEASE_VERSION,
    nav: {
      workbench: '在线体验',
      features: '顺手在哪',
      guarantees: '安心边界',
      install: '安装步骤',
      architecture: '工作原理',
      github: 'GitHub',
      cta: '去安装',
      themeLabel: '界面主题',
      themeOptions: {
        system: '跟随系统',
        light: '浅色',
        dark: '深色',
      },
      localeToggle: 'EN',
    },
    hero: {
      eyebrow: `DSH 多设备插件 · ${RELEASE_VERSION} · 开源免费`,
      title: '在一个 DSH 窗口里，管好你的所有开发机',
      subtitle:
        '连上云主机、GPU 服务器或备用电脑后，顶部标签一点就切。哪台机在等你确认、哪台刚刚跑完，一眼就能看见。远程服务器不用装插件，本地记录也不会混成一团。',
      primaryCta: '三步装好插件',
      secondaryCta: '查看 GitHub',
      modeConverged: '装上插件：一个窗口搞定',
      modeScattered: '安装前：到处找窗口',
      modeConvergedHint:
        '点一点顶部设备标签、琥珀色「1」待确认提醒，或试着发一条消息，感受真实窗口切换。',
      modeScatteredHint:
        '以前同时开着本地电脑、云主机、GPU 和打包机，只能在一堆标签和终端里来回找。点任意一张卡片，看看合进一个窗口后的样子。',
      clickToDockHint: '点击这张卡片，收进同一个 DSH 窗口',
      dockThisWindow: '收进统一窗口',
    },
    connectionStrip: {
      badge: 'SSH 自动连接',
      summary: '直接读取你电脑里配好的 ~/.ssh/config · 远程零安装 · 4 台设备在线',
      tip: '点击左侧任意项目或顶部设备，切回来时草稿与滚动位置都在。',
    },
    workbench: {
      taskbarLabel: '任务汇总',
      addDeviceTooltip: '在「设置 → 多设备」中添加机器',
      sidebarTitle: '当前设备对话',
      sidebarNewChat: '新建对话',
      activeTaskBanner: '正在切换至选中的远程对话',
      approvalPromptLabel: '等待你的确认',
      approveAllow: '允许执行',
      approveDeny: '暂不执行',
      approvedNotice: '你已允许执行，任务已继续向后运行。',
      deniedNotice: '已取消本次高风险动作，设备已回到空闲等待状态。',
      draftSavedNote: '草稿已保存在本设备标签页内',
      placeholder: '向当前设备发送指令，切换其他设备时这里的草稿不会丢失…',
      sendAria: '发送消息',
      modelChip: 'deepseek-reasoner',
      agentChip: 'Default Agent',
      simulatedStreamReply: (prompt) =>
        `收到你的指令「${prompt}」。当前直接在「这台设备」本地执行并汇报进度：\n1. 已核对当前分支与工作目录状态；\n2. 正在运行对应检查脚本…`,
      simulatedStreamFinal: '检查完成，所有改动已就绪，你可以直接核对结果或继续下一步。',
      attentionMenuTitle: '这台设备需要你留意的对话',
      attentionGroups: {
        pending: '等你点确认',
        running: '正在运行中',
        done: '刚完成（未读）',
      },
      offlineBanner: '暂时没连上这台设备，本地原有对话仍保留。',
      reconnectBtn: '重新连接',
      settingsModal: {
        title: '设置 · 多设备管理',
        subtitle:
          '插件只安装在你面前这台电脑的 DSH 里，会自动读取本地 SSH 别名，无需在远端服务器额外装软件。',
        sshAutoDiscovery: '从 ~/.ssh/config 发现了 1 台尚未加入顶栏的设备',
        quickImportBtn: '+ 加入顶部标签栏 (prod-arm64)',
        importedTag: '已加入顶栏',
        remoteSetupNote:
          '提示：如果远端机器只运行普通的 dsh web，直接通过本地 SSH 安全通道就能用。',
        closeBtn: '完成',
      },
    },
    features: {
      eyebrow: '日常怎么用',
      title: '顺手的地方，全在每天切机器的细节里',
      subtitle: '不改变你习惯的 DSH 操作方式，只是把分散在各处的窗口整整齐齐收进同一栏。',
      cards: [
        {
          tag: '不重刷页面',
          title: '标签一按就切走，写一半的内容不会丢',
          body: '切换设备时，后台页面安静保持原样。正在输出的进度、滚动到的位置、框里写了一半的提示词都会留着，随时切回来继续。',
        },
        {
          tag: '状态一目了然',
          title: '谁跑完了、谁卡在确认，看颜色就知道',
          body: '顶部标签右边的小胶囊用颜色区分状态：琥珀色代表等你点「允许」，蓝色代表正在跑，绿色代表刚出结果。点一下直接跳进对应对话。',
        },
        {
          tag: '少走弯路',
          title: '打开远程 Git 项目，自动帮你切过去',
          body: '如果手头目录本来就对应公司服务器或云主机，系统会贴心提示切换过去，不用自己翻配置找设备名。',
        },
      ],
    },
    guarantees: {
      eyebrow: '安稳不折腾',
      title: '只管窗口整理，绝不动你原本的环境',
      subtitle: '你不需要为了用它去改造服务器，也不用担心不同电脑的对话混在一起。',
      items: [
        {
          badge: '01',
          title: '远程服务器完全不用动',
          body: '只装在你当前使用的 DSH 里。远端机器照常开着 dsh web 就行，不会给远程安装脚本或写配置文件。',
        },
        {
          badge: '02',
          title: '代码与文件各自待在原处',
          body: '不做跨机文件同步，也不偷偷克隆仓库。你在哪个标签下发指令，读取和改动的就只属于那台设备。',
        },
        {
          badge: '03',
          title: '本机与远程记录清清楚楚',
          body: '本地侧边栏永远只显示本机自己的对话，每台远程电脑的历史只在它自己的标签里看得到，绝对不会乱串。',
        },
        {
          badge: '04',
          title: '配好 SSH 就能直接连',
          body: '复用电脑里现成的 ~/.ssh/config 和私钥。默认只走你本机发起的安全加密转发，安全边界清晰。',
        },
      ],
    },
    install: {
      eyebrow: '开始使用',
      title: '三步装进你的 DSH',
      subtitle: '不需要配置繁琐环境，直接在 DSH 插件设置里粘贴下方安装包地址即可。',
      urlLabel: `v0.3.6 插件安装包地址（GitHub Release .tgz）`,
      copyBtn: '复制链接',
      copiedBtn: '已复制',
      releasesLink: '前往 GitHub Releases',
      steps: [
        {
          num: '01',
          title: '打开 DSH 设置里的插件页',
          body: '进入当前正在用的 DSH Desktop 或本地 DSH Web，打开「设置 → 插件」。',
        },
        {
          num: '02',
          title: '选择「从 URL 安装」并粘贴链接',
          body: '复制左侧的 .tgz 发布地址贴进去完成安装；重载界面后顶部就会出现设备栏。',
        },
        {
          num: '03',
          title: '点右上角「+」勾选常用服务器',
          body: '插件会自动列出你 SSH 配置里的主机别名，选完直接开启使用。',
        },
      ],
      cliPanelTitle: '习惯用命令行的用户：复制终端安装命令',
      cliDesktopLabel: '安装到 DSH Desktop',
      cliWebLabel: '安装到本地 DSH Web',
      checklistPanelTitle: '连不上或没看到提醒？先快速排查这 4 件事',
      checklistItems: [
        {
          question: '1. 远端服务器上的 dsh web 启动了吗？',
          answer: '确认目标机器已经启动了 dsh web 服务，端口处于正常监听状态。',
        },
        {
          question: '2. 本机终端能直接 ssh <别名> 免密登录吗？',
          answer: '插件直接复用系统的 SSH；如果在命令行里就能直接免密登上去，插件就能连上。',
        },
        {
          question: '3. 当前是不是在本地地址里打开的 DSH？',
          answer: '本插件支持 DSH Desktop 以及本机 127.0.0.1 / localhost 打开的 HTTP 版 DSH Web。',
        },
        {
          question: '4. 遇到过老版本 OpenSSH 报错？',
          answer: '确保本机 OpenSSH 客户端支持本地端口转发（macOS、Linux 与 Windows 10/11 自带 OpenSSH 均可）。',
        },
      ],
    },
    architecture: {
      eyebrow: '技术透明',
      panelTitle: '底层安全与工作原理（展开查看连接细节与支持边界）',
      panelSummary: '面向想了解端口转发机制、状态保活方式以及适用边界的开发者',
      items: [
        {
          title: '默认基于系统 SSH 环回端口转发',
          body: '每台已启用远程设备默认使用 system-ssh，通过本机 OpenSSH 建立独立的 127.0.0.1 本地环回转发端口，不暴露给局域网或公网。「HTTP(S) direct」仅作高级兼容开关保留且默认关闭。',
        },
        {
          title: '独立容器 Keep-Alive 保留现场',
          body: '已连接设备会保留各自的对话容器与草稿状态，切换标签时不会重新加载整页、也不会打断后台正在执行的输出流。',
        },
        {
          title: '三色状态严格按需提醒（待确认 > 运行中 > 刚完成）',
          body: '只有真实发生的审批阻塞、运行任务或新完成未读会计算进胶囊徽标；点击切换到未读对话时自动消红，且不虚构未开启设备的在线状态。',
        },
        {
          title: '支持环境边界与安装包来源说明',
          body: '仅在 DSH Desktop 或本机 127.0.0.1 / localhost HTTP DSH Web 下生效（不支持远程浏览器直访、HTTPS 嵌套 HTTP 或 IPv6 父页面）。本插件未发布至公共 npm，请仅从 GitHub Release .tgz URL 安装。',
        },
      ],
    },
    footer: {
      note: 'dsh-multi-device · 专为 DeepSeek Harness (DSH) 打造的多设备标签插件',
      license: 'MIT 开源协议',
      repo: 'GitHub 源码',
      releases: '版本发布记录',
    },
  },
  en: {
    brand: 'dsh-multi-device',
    brandTag: RELEASE_VERSION,
    nav: {
      workbench: 'Live Demo',
      features: 'Why It Helps',
      guarantees: 'Safety',
      install: 'Install',
      architecture: 'How It Works',
      github: 'GitHub',
      cta: 'Get Started',
      themeLabel: 'Theme',
      themeOptions: {
        system: 'System',
        light: 'Light',
        dark: 'Dark',
      },
      localeToggle: '中文',
    },
    hero: {
      eyebrow: `DSH Multi-Device Plugin · ${RELEASE_VERSION} · Open Source`,
      title: 'Manage every dev machine inside one DSH window.',
      subtitle:
        'Connect your cloud VM, GPU box, and spare laptop via your existing SSH setup. Switch cleanly from one top tab bar with calm status pills—no remote plugins required and zero local history clutter.',
      primaryCta: 'Install in 3 steps',
      secondaryCta: 'View on GitHub',
      modeConverged: 'With plugin: One tab strip',
      modeScattered: 'Before: 4 scattered windows',
      modeConvergedHint:
        'Click top device tabs, tap the amber "1" pill, or send a prompt to see real multi-machine switching in action.',
      modeScatteredHint:
        'Without the plugin, hopping between local DSH, SSH terminals, GPU servers, and build Macs means hunting for tabs. Click any card below to dock it into one window.',
      clickToDockHint: 'Click card to dock into the unified window',
      dockThisWindow: 'Dock into one window',
    },
    connectionStrip: {
      badge: 'SSH Ready',
      summary: 'Reads your existing ~/.ssh/config · Zero remote install · 4 machines active',
      tip: 'Switch tabs freely—unsent drafts and scroll position stay put.',
    },
    workbench: {
      taskbarLabel: 'All machines',
      addDeviceTooltip: 'Manage devices in Settings → Multi-Device',
      sidebarTitle: 'Device conversations',
      sidebarNewChat: 'New chat',
      activeTaskBanner: 'Focused on selected conversation',
      approvalPromptLabel: 'Needs your approval',
      approveAllow: 'Allow',
      approveDeny: 'Decline',
      approvedNotice: 'Approved. The agent resumed running on this machine.',
      deniedNotice: 'Action declined. Session returned to idle.',
      draftSavedNote: 'Unsent draft stays inside this tab',
      placeholder: 'Message this machine—switching tabs preserves what you typed…',
      sendAria: 'Send message',
      modelChip: 'deepseek-reasoner',
      agentChip: 'Default Agent',
      simulatedStreamReply: (prompt) =>
        `Got "${prompt}". Running directly inside this machine's workspace:\n1. Checked current git status and target directory;\n2. Executing quick verification checks…`,
      simulatedStreamFinal: 'Checks passed. Changes are ready for review.',
      attentionMenuTitle: 'Conversations needing attention',
      attentionGroups: {
        pending: 'Waiting for approval',
        running: 'Running now',
        done: 'Finished (unread)',
      },
      offlineBanner: 'Could not reach this machine yet. Local history remains safe.',
      reconnectBtn: 'Reconnect',
      settingsModal: {
        title: 'Settings · Multi-Device',
        subtitle:
          'Installed only on your computer. Discovers SSH host aliases locally without touching remote servers.',
        sshAutoDiscovery: 'Found 1 SSH alias in ~/.ssh/config not yet pinned to the tab bar',
        quickImportBtn: '+ Add to tab bar (prod-arm64)',
        importedTag: 'Pinned',
        remoteSetupNote:
          'Note: Remote servers just run stock dsh web—traffic travels safely through your local SSH tunnel.',
        closeBtn: 'Done',
      },
    },
    features: {
      eyebrow: 'Everyday Flow',
      title: 'Smooth in all the moments that usually break focus',
      subtitle: 'Everything still feels like native DSH—only now all your machines live in one quiet top strip.',
      cards: [
        {
          tag: 'Instant switching',
          title: 'Flip between machines without losing your place',
          body: 'Background tabs stay quietly alive while you switch. Streaming answers, scroll offsets, and half-written prompts are right where you left them.',
        },
        {
          tag: 'Calm status pills',
          title: 'Know which box needs you at a glance',
          body: 'Tiny color-coded pills show what needs attention: amber when an approval is waiting, blue while running, green for finished replies. Click once to jump straight there.',
        },
        {
          tag: 'Zero guesswork',
          title: 'Opens the right machine for remote repos',
          body: 'When you open a project whose Git remote points to another server, the plugin offers to switch straight to that host so you never edit in the wrong place.',
        },
      ],
    },
    guarantees: {
      eyebrow: 'Non-Intrusive',
      title: 'Keeps everything tidy without touching what works',
      subtitle: 'Designed to stay out of your way and leave your existing servers untouched.',
      items: [
        {
          badge: '01',
          title: 'Zero changes on remote servers',
          body: 'Only your local DSH loads the plugin. Remote machines run stock dsh web—no server-side scripts or extra configs.',
        },
        {
          badge: '02',
          title: 'Files never leave their machine',
          body: 'Nothing clones or mirrors your folders across hosts. Each tab talks directly to the machine where those files live.',
        },
        {
          badge: '03',
          title: 'Local sidebar stays clean',
          body: 'Your laptop conversations stay on your local tab. Remote sessions remain scoped cleanly inside each machine tab.',
        },
        {
          badge: '04',
          title: 'Works with your existing SSH setup',
          body: 'Reuses ~/.ssh/config aliases and keys you already trust. Uses local loopback forwarding by default—no public ports exposed.',
        },
      ],
    },
    install: {
      eyebrow: 'Setup',
      title: 'Install in three quick steps',
      subtitle: 'Paste the official release package URL directly inside DSH Settings.',
      urlLabel: `v0.3.6 Package URL (GitHub Release .tgz)`,
      copyBtn: 'Copy URL',
      copiedBtn: 'Copied',
      releasesLink: 'Open GitHub Releases',
      steps: [
        {
          num: '01',
          title: 'Open DSH Plugin Settings',
          body: 'Launch your DSH Desktop or local DSH Web window and navigate to Settings → Plugins.',
        },
        {
          num: '02',
          title: 'Choose "Install from URL" & paste',
          body: 'Copy the .tgz link on the left, paste it into DSH, and reload once installed.',
        },
        {
          num: '03',
          title: 'Click "+" in the top bar to pick hosts',
          body: 'Pick any SSH host from ~/.ssh/config and your multi-device tab bar is ready.',
        },
      ],
      cliPanelTitle: 'Prefer the terminal? Show CLI install commands',
      cliDesktopLabel: 'Install for DSH Desktop',
      cliWebLabel: 'Install for local DSH Web',
      checklistPanelTitle: 'Not seeing your remote machine? Check these 4 quick things',
      checklistItems: [
        {
          question: '1. Is dsh web running on the remote host?',
          answer: 'Make sure dsh web is started and listening normally on the target computer.',
        },
        {
          question: '2. Does "ssh <host>" connect without interactive prompts?',
          answer: 'If your terminal can log in cleanly via SSH keys, the plugin can connect too.',
        },
        {
          question: '3. Are you opening DSH Desktop or local 127.0.0.1 / localhost HTTP?',
          answer: 'The plugin supports DSH Desktop and local loopback HTTP Web GUI sessions.',
        },
        {
          question: '4. Does local OpenSSH support port forwarding?',
          answer: 'Built-in OpenSSH on macOS, Linux, and Windows 10/11 works out of the box.',
        },
      ],
    },
    architecture: {
      eyebrow: 'Under the Hood',
      panelTitle: 'Architecture, SSH security & support boundaries (expand details)',
      panelSummary: 'Technical details on loopback forwarding, keep-alive containers, and strict boundaries',
      items: [
        {
          title: 'Loopback SSH forwarding by default (system-ssh)',
          body: 'Enabled machines open isolated 127.0.0.1 loopback tunnels via system OpenSSH—never exposing remote DSH ports publicly. HTTP(S) direct mode stays off unless explicitly enabled.',
        },
        {
          title: 'Controlled DOM Keep-Alive tabs',
          body: 'Each active device preserves its viewport instance, scroll state, and composer draft in memory while switching tabs.',
        },
        {
          title: 'Priority status rollup (Pending > Running > Done)',
          body: 'Only live approvals, running turns, and unread completions populate each tab capsule; opening an unread session clears its counter immediately.',
        },
        {
          title: 'Supported parent environments & package source',
          body: 'Supports DSH Desktop and local 127.0.0.1/localhost HTTP DSH Web only (remote browser parents, HTTPS->HTTP mixed content, and IPv6 origins are unsupported). Distributed solely via GitHub Release .tgz.',
        },
      ],
    },
    footer: {
      note: 'dsh-multi-device · Multi-device tab strip plugin for DeepSeek Harness (DSH)',
      license: 'MIT License',
      repo: 'Source on GitHub',
      releases: 'Releases',
    },
  },
}
