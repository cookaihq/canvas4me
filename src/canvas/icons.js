/**
 * Canvas4me 图标登记中心 — 唯一从 lucide-react 出口的地方
 *
 * 业务代码统一从 @/canvas/icons import,不直接 import lucide-react
 * 也不再用 @ant-design/icons (ESLint 双向守门)
 *
 * 详见 docs/ui-standards/icons.html (业务映射 + 完整图标库)
 *      docs/superpowers/specs/2026-05-17-ui-standards-design.md §5
 */

import {
  // 业务核心
  Sparkles, Image, Film, AudioLines, Wrench,
  Type, FileText, StickyNote, MousePointer2, Hand,

  // 通用 UI
  Plus, X, Settings, SlidersHorizontal, HelpCircle, User, Folder, FolderOpen, FolderArchive,
  Loader2, Search, RotateCw, Link, Maximize2, Minimize2, Eraser, ArrowRightLeft,
  Check, File, Cloud, Bell, Wallet, Filter,

  // 编辑动作
  Pencil, Trash2, Copy, ClipboardType, Download, Upload, Eye, ImagePlus,

  // 媒体控制
  Play, Pause, PlayCircle, PauseCircle, Headphones,

  // 状态/反馈
  AlertCircle, AlertTriangle, Info, CheckCircle, Clock, ShieldCheck, Lock, Star,

  // 计费/能耗
  Coins, Flame, Zap,

  // 导航/箭头
  ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Home,

  // 沟通/调试
  MessageCircle, MessageSquare, MessageSquareText, Mail, Bug, Code2,

  // 候选 (画布外可能用到)
  Brain, Bot, Cpu, Music, Volume2, Mic,
  LogOut, Key, Users, UserPlus, UserRound, LayoutGrid, WandSparkles, Clapperboard,
  Shuffle, Settings2, Minus, RectangleHorizontal, ArrowLeftRight,
  Expand, Video, AtSign, RefreshCw, RotateCcw, ArrowUpDown, ExternalLink,

  // UI Standards section header 装饰图标 (M1/M2: components-canvas + components-base)
  BadgeInfo, Layers, PanelBottom, LayoutPanelLeft, CircleDot, Activity,
  SquareMousePointer, TextCursorInput, Square, AppWindow, Tag,
} from 'lucide-react'

// ─── 业务语义映射 ───
//
// 业务代码用 NodeTypeIcons.llm 而不是 Sparkles —— 当未来"大模型"换 icon 时,
// 只改这一处,所有用到的地方自动跟进。

export const NodeTypeIcons = {
  llm: Sparkles,        // 大语言模型 (跟 BrandLogo 魔杖呼应 AI=魔法)
  image: Image,         // 图片创作
  video: Film,          // 视频创作
  sound: AudioLines,    // 声音创作 (呼应音频节点的波形)
  tool: Wrench,         // 工具
}

export const InputTypeIcons = {
  text: Type,           // 文本节点 (Type 比 FileText 更直白)
  image: Image,
  video: Film,
  audio: AudioLines,
  file: FileText,       // 文件节点
  note: StickyNote,     // 备注节点
}

export const ToolIcons = {
  cursor: MousePointer2,  // 移动工具
  hand: Hand,             // 抓手工具
  add: Plus,              // + 按钮
}

// ─── transitive export (业务代码统一从这里 import) ───

export {
  // 业务核心
  Sparkles, Image, Film, AudioLines, Wrench,
  Type, FileText, StickyNote, MousePointer2, Hand,
  // 通用 UI
  Plus, X, Settings, SlidersHorizontal, HelpCircle, User, Folder, FolderOpen, FolderArchive,
  Loader2, Search, RotateCw, Link, Maximize2, Minimize2, Eraser, ArrowRightLeft,
  Check, File, Cloud, Bell, Wallet, Filter,
  // 编辑动作
  Pencil, Trash2, Copy, ClipboardType, Download, Upload, Eye, ImagePlus,
  // 媒体控制
  Play, Pause, PlayCircle, PauseCircle, Headphones,
  // 状态/反馈
  AlertCircle, AlertTriangle, Info, CheckCircle, Clock, ShieldCheck, Lock, Star,
  // 计费/能耗
  Coins, Flame, Zap,
  // 导航/箭头
  ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Home,
  // 沟通/调试
  MessageCircle, MessageSquare, MessageSquareText, Mail, Bug, Code2,
  // 候选
  Brain, Bot, Cpu, Music, Volume2, Mic,
  LogOut, Key, Users, UserPlus, UserRound, LayoutGrid, WandSparkles, Clapperboard,
  Shuffle, Settings2, Minus, RectangleHorizontal, ArrowLeftRight,
  Expand, Video, AtSign, RefreshCw, RotateCcw, ArrowUpDown, ExternalLink,
  // UI Standards section header 装饰图标
  BadgeInfo, Layers, PanelBottom, LayoutPanelLeft, CircleDot, Activity,
  SquareMousePointer, TextCursorInput, Square, AppWindow, Tag,
}
