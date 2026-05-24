import { useEffect, useMemo, useRef, useState } from 'react'
import { Input, Tabs, Empty, Spin, Segmented, Button, message, Badge, Pagination } from 'antd'
import { Modal } from '@/canvas/components/AntdWrappers'
import { Search, PlayCircle, PauseCircle, RotateCw, Star, Filter, Pencil, Mic, Check } from '@/canvas/icons'
import { useVoicePresets } from '@/platform/provider.jsx'
import { useMediaSource } from '@/canvas/hooks/useMediaSource'

function VoiceCover({ url }) {
  const { displayUrl, markError } = useMediaSource(url, { kind: 'image' })
  return <img src={displayUrl} alt="" onError={markError} />
}
import VoiceFilterModal from './VoiceFilterModal'
import EditVoiceModal from './clone/EditVoiceModal'
import CloneVoiceModal from './clone/CloneVoiceModal'
import {
  getLocalFavorites,
  isLocalFavorited,
  addLocalFavorite,
  removeLocalFavorite,
} from './voiceLocalFavorites'

/**
 * 二级音色选择器 modal
 *
 * 三个 tab(按 capabilities flag 条件渲染):
 *   1. 音色库 (library, 总是显示) — 通用预设 17 项 + 扩展预设 (按 language 拉)
 *   2. 我的音色 (myVoices, capabilities.cloneVoices=true 时显示) — listMyVoices()
 *   3. 收藏音色 (favorites, capabilities.favorites=true 时显示) — listFavoritedVoices()
 *
 * 懒加载:每个 tab 切到时再拉对应数据,独立 loading / error / data state。
 *
 * 交互:
 *   - 顶部搜索框: 按 voice_name / voice_id / tag 模糊匹配 (在当前 tab 数据上过滤)
 *   - 语言切换 (zh / en) 仅影响"音色库"扩展预设的展示名
 *   - 试听按钮: 仅 sample_audio 存在时显示, 同时只播一条
 *   - 克隆新音色按钮(仅 capabilities.cloneVoices=true): 唤起 CloneVoiceModal (需传 projectId + nodeId)
 *   - 选中后 onSelect(voice) 由父组件关闭 — 回传完整 voice 对象 {voice_id, voice_name, ...},
 *     便于父组件把 voice_name 一并写入 modeParams 用于后续展示
 *
 * Props:
 *   value: string (当前选中的 voice_id)
 *   language: string (Chinese/English, 影响音色库展示语言)
 *   onSelect: (voice) => void (选中音色时回调, 传完整 voice 对象)
 *   onClose: () => void (关闭 modal)
 *   projectId?: string (当前画布 id, 克隆音色时需要)
 *   nodeId?: string (触发克隆的节点 id, 克隆音色时需要)
 */
export default function VoicePickerModal({ value, language = 'Chinese', onSelect, onClose, projectId, nodeId }) {
  const voicePresets = useVoicePresets()
  const caps = voicePresets?.capabilities ?? { cloneVoices: false, favorites: false }

  const [tab, setTab] = useState('library')
  const [lang, setLang] = useState(language?.startsWith('English') ? 'en' : 'zh')
  const [search, setSearch] = useState('')
  const [filterOpen, setFilterOpen] = useState(false)
  const [currentFilter, setCurrentFilter] = useState({})
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)

  // 音色库 tab — 扩展预设 (通用预设是常量, 直接拼接)
  const [libraryData, setLibraryData] = useState([])
  const [libraryLoading, setLibraryLoading] = useState(false)
  const [libraryError, setLibraryError] = useState(null)

  // 我的音色 tab
  const [myVoicesData, setMyVoicesData] = useState([])
  const [myVoicesLoading, setMyVoicesLoading] = useState(false)
  const [myVoicesError, setMyVoicesError] = useState(null)
  const [myVoicesLoaded, setMyVoicesLoaded] = useState(false)

  // 收藏音色 tab
  const [favoritesData, setFavoritesData] = useState([])
  const [favoritesLoading, setFavoritesLoading] = useState(false)
  const [favoritesError, setFavoritesError] = useState(null)
  const [favoritesLoaded, setFavoritesLoaded] = useState(false)

  const [playingId, setPlayingId] = useState(null)
  const audioRef = useRef(null)

  // 正在切换收藏状态的 voice_id 集合 — 防止双击
  const [togglingIds, setTogglingIds] = useState(() => new Set())

  // 本地预设收藏的版本号 — 用于在 localStorage 收藏变化时强制 re-render
  const [localFavoritesVersion, setLocalFavoritesVersion] = useState(0)

  // 编辑音色弹窗
  const [editingVoice, setEditingVoice] = useState(null)
  const [editOpen, setEditOpen] = useState(false)

  // 克隆音色弹窗
  const [cloneOpen, setCloneOpen] = useState(false)

  // 音色库刷新触发器 — bump 后 effect 重跑, fetch 时带 force:true 失效模块级缓存
  const [libraryRefreshTick, setLibraryRefreshTick] = useState(0)

  // 音色库: 切到 library tab 或 lang 变化时重新拉扩展预设
  useEffect(() => {
    if (tab !== 'library') return
    let alive = true
    setLibraryLoading(true)
    setLibraryError(null)
    voicePresets.fetch(lang, { force: libraryRefreshTick > 0 })
      .then(list => {
        if (!alive) return
        setLibraryData(Array.isArray(list) ? list : [])
        setLibraryLoading(false)
      })
      .catch(err => {
        if (!alive) return
        setLibraryError(err?.message || '加载音色库失败')
        setLibraryData([])
        setLibraryLoading(false)
      })
    return () => { alive = false }
  }, [tab, lang, voicePresets, libraryRefreshTick])

  // 我的音色: 切到 myVoices tab 时拉一次 (后续不随 lang 重拉)
  useEffect(() => {
    if (tab !== 'myVoices') return
    if (myVoicesLoaded) return
    let alive = true
    setMyVoicesLoading(true)
    setMyVoicesError(null)
    voicePresets.listMyVoices()
      .then(list => {
        if (!alive) return
        setMyVoicesData(Array.isArray(list) ? list : [])
        setMyVoicesLoading(false)
        setMyVoicesLoaded(true)
      })
      .catch(err => {
        if (!alive) return
        setMyVoicesError(err?.message || '加载我的音色失败')
        setMyVoicesData([])
        setMyVoicesLoading(false)
      })
    return () => { alive = false }
  }, [tab, voicePresets, myVoicesLoaded])

  // 收藏音色: 切到 favorites tab 时拉一次
  useEffect(() => {
    if (tab !== 'favorites') return
    if (favoritesLoaded) return
    let alive = true
    setFavoritesLoading(true)
    setFavoritesError(null)
    voicePresets.listFavoritedVoices()
      .then(list => {
        if (!alive) return
        setFavoritesData(Array.isArray(list) ? list : [])
        setFavoritesLoading(false)
        setFavoritesLoaded(true)
      })
      .catch(err => {
        if (!alive) return
        setFavoritesError(err?.message || '加载收藏音色失败')
        setFavoritesData([])
        setFavoritesLoading(false)
      })
    return () => { alive = false }
  }, [tab, voicePresets, favoritesLoaded])

  // 切 tab 时停止试听
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    setPlayingId(null)
  }, [tab])

  // 切 tab / 搜索 / filter 变化时重置分页到第 1 页
  useEffect(() => {
    setCurrentPage(1)
  }, [tab, search, currentFilter])

  // 音色库的展示数据 = 扩展预设 (不再包含 17 项硬编码通用预设)
  const libraryItems = useMemo(() => {
    return libraryData
  }, [libraryData])

  // 纯函数: 按筛选条件过滤音色列表
  // 如果 voice 缺失某字段，当该字段的过滤器启用时，此 voice 被过滤掉
  const filterVoicesByCriteria = (list, filter) => {
    if (!filter || Object.keys(filter).length === 0) return list
    return list.filter(v => {
      // language 过滤
      if (filter.language !== undefined) {
        if (!v.language || v.language !== filter.language) return false
      }
      // accent 过滤
      if (filter.accent !== undefined) {
        if (!v.accent || v.accent !== filter.accent) return false
      }
      // gender 过滤 (过滤掉 '全部')
      if (filter.gender && filter.gender !== '全部') {
        if (!v.gender || v.gender !== filter.gender) return false
      }
      // ageList 过滤 (多选, AND 逻辑: voice 的 age 必须在 ageList 中)
      if (filter.ageList && filter.ageList.length > 0) {
        if (!v.age || !filter.ageList.includes(v.age)) return false
      }
      return true
    })
  }

  // 纯函数: 按搜索关键词过滤音色列表
  const filterVoicesByKeyword = (list, keyword) => {
    if (!keyword.trim()) return list
    const q = keyword.trim().toLowerCase()
    return list.filter(v => {
      const tags = Array.isArray(v.tag_list) ? v.tag_list.join(' ').toLowerCase() : ''
      return (v.voice_id || '').toLowerCase().includes(q)
        || (v.voice_name || '').toLowerCase().includes(q)
        || tags.includes(q)
    })
  }

  const filteredLibrary = useMemo(() => {
    const afterCriteria = filterVoicesByCriteria(libraryItems, currentFilter)
    return filterVoicesByKeyword(afterCriteria, search)
  }, [libraryItems, currentFilter, search])

  const filteredMyVoices = useMemo(() => {
    const afterCriteria = filterVoicesByCriteria(myVoicesData, currentFilter)
    return filterVoicesByKeyword(afterCriteria, search)
  }, [myVoicesData, currentFilter, search])

  // 收藏 tab 渲染数据 = 服务端克隆收藏 + 本地预设收藏 (按 voice_id 去重, 本地预设排在后)
  const mergedFavorites = useMemo(() => {
    const local = getLocalFavorites()
    const seen = new Set(favoritesData.map(v => v.voice_id))
    const localUnique = local.filter(v => !seen.has(v.voice_id))
    return [...favoritesData, ...localUnique]
    // localFavoritesVersion 用于在 localStorage 收藏变化时触发重算
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [favoritesData, localFavoritesVersion])

  const filteredFavorites = useMemo(() => {
    const afterCriteria = filterVoicesByCriteria(mergedFavorites, currentFilter)
    return filterVoicesByKeyword(afterCriteria, search)
  }, [mergedFavorites, currentFilter, search])

  // 计算当前页的分页列表 (pageSize 由用户在 Pagination 下拉里选, 默认 50)
  const getPagedList = (list) => {
    return list.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  }

  const handlePlay = (item) => {
    if (!item.sample_audio) return
    if (playingId === item.voice_id) {
      audioRef.current?.pause()
      setPlayingId(null)
      return
    }
    if (audioRef.current) {
      audioRef.current.pause()
    }
    const audio = new Audio(item.sample_audio)
    audioRef.current = audio
    audio.play().catch(() => {
      message.warning('试听失败')
      setPlayingId(null)
    })
    audio.onended = () => setPlayingId(null)
    setPlayingId(item.voice_id)
  }

  // unmount 清理
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
    }
  }, [])

  // 切换收藏: 乐观更新本地 state, 失败回滚 + toast
  // preset 音色 (library tab 来源 或 标记 __source='preset') 走 localStorage;
  // clone 音色 (myVoices / favorites 里的服务端音色) 走 toggleFavorite 端点.
  const handleToggleFavorite = async (voice, sourceTab) => {
    const voiceId = voice.voice_id
    if (!voiceId) return
    if (togglingIds.has(voiceId)) return

    const isPreset = sourceTab === 'library' || voice.__source === 'preset'

    if (isPreset) {
      // 纯前端 localStorage 流程
      const wasFav = isLocalFavorited(voiceId)
      if (wasFav) {
        removeLocalFavorite(voiceId)
        // 如果是在 favorites tab 内取消, 立即从 favoritesData 移除 (mergedFavorites 也会更新)
        if (sourceTab === 'favorites') {
          setFavoritesData(prev => prev.filter(v => v.voice_id !== voiceId))
        }
      } else {
        addLocalFavorite(voice)
      }
      // 触发依赖 localFavoritesVersion 的派生数据重算
      setLocalFavoritesVersion(v => v + 1)
      return
    }

    const nextFavorited = !voice.favorited

    // mark toggling
    setTogglingIds(prev => {
      const next = new Set(prev)
      next.add(voiceId)
      return next
    })

    // 乐观更新: 在两个 tab 的数据里同步翻转 (voice_id 跨 tab 唯一)
    setMyVoicesData(prev => prev.map(v => v.voice_id === voiceId ? { ...v, favorited: nextFavorited } : v))
    if (sourceTab === 'favorites' && !nextFavorited) {
      // 在收藏 tab 取消收藏 → 行立即消失
      setFavoritesData(prev => prev.filter(v => v.voice_id !== voiceId))
    } else {
      setFavoritesData(prev => prev.map(v => v.voice_id === voiceId ? { ...v, favorited: nextFavorited } : v))
    }

    try {
      await voicePresets.toggleFavorite(voiceId, nextFavorited)
      // 成功: 乐观更新已经是最终态, 无需回写 (响应里 favorited 应与翻转后一致)
    } catch (err) {
      // 回滚
      setMyVoicesData(prev => prev.map(v => v.voice_id === voiceId ? { ...v, favorited: voice.favorited } : v))
      if (sourceTab === 'favorites' && !nextFavorited) {
        // 把刚移除的行加回去 (保持原顺序的近似 — 简化为追加末尾, 也可重新拉)
        setFavoritesData(prev => {
          if (prev.some(v => v.voice_id === voiceId)) return prev
          return [...prev, { ...voice, favorited: voice.favorited }]
        })
      } else {
        setFavoritesData(prev => prev.map(v => v.voice_id === voiceId ? { ...v, favorited: voice.favorited } : v))
      }
      message.error(err?.message || '操作失败,请重试')
    } finally {
      setTogglingIds(prev => {
        const next = new Set(prev)
        next.delete(voiceId)
        return next
      })
    }
  }

  const handleRetry = () => {
    if (tab === 'library') {
      // 触发重拉:通过改写 loaded 标志不适用 (library 没用 loaded), 改用主动调一次
      setLibraryLoading(true)
      setLibraryError(null)
      voicePresets.fetch(lang)
        .then(list => {
          setLibraryData(Array.isArray(list) ? list : [])
          setLibraryLoading(false)
        })
        .catch(err => {
          setLibraryError(err?.message || '加载音色库失败')
          setLibraryData([])
          setLibraryLoading(false)
        })
    } else if (tab === 'myVoices') {
      setMyVoicesLoaded(false)
    } else if (tab === 'favorites') {
      setFavoritesLoaded(false)
    }
  }

  const handleEdit = (voice) => {
    setEditingVoice(voice)
    setEditOpen(true)
  }

  const tabItems = [
    { key: 'library', label: '音色库' },
  ]
  if (caps.cloneVoices) {
    tabItems.push({ key: 'myVoices', label: '我的音色' })
  }
  // 收藏 tab 总是显示 — 即使后端不支持 (caps.favorites=false), localStorage 的预设
  // 收藏也在这里展示, 让用户点了星标后有地方查看 (OSS 场景关键)
  tabItems.push({ key: 'favorites', label: '收藏音色' })

  const renderList = (items, loading, error, totalCount) => {
    if (loading) {
      return <div className="ms-dp-voice-picker-loading"><Spin /></div>
    }
    if (error) {
      return (
        <div className="ms-dp-voice-picker-error">
          <Empty description={error} image={Empty.PRESENTED_IMAGE_SIMPLE} />
          <Button icon={<RotateCw size={14} />} size="small" onClick={handleRetry}>重试</Button>
        </div>
      )
    }
    if (!items || items.length === 0) {
      const emptyDesc = search.trim() ? '没有匹配的音色' : '无音色'
      return <Empty description={emptyDesc} image={Empty.PRESENTED_IMAGE_SIMPLE} />
    }
    return (
      <>
        {items.map(item => {
          // 收藏状态判定:
          // - library tab 的行 (或 __source='preset' 的合并行) → 走 localStorage
          // - myVoices / favorites tab 的服务端克隆音色 → 用 item.favorited 字段
          const isPreset = tab === 'library' || item.__source === 'preset'
          const favorited = isPreset
            ? isLocalFavorited(item.voice_id)
            : item.favorited === true
          return (
            <VoicePickerRow
              key={item.id || item.voice_id}
              item={item}
              favorited={favorited}
              selected={item.voice_id === value}
              onClick={() => onSelect?.(item)}
              onPlay={item.sample_audio ? () => handlePlay(item) : undefined}
              playing={playingId === item.voice_id}
              onToggleFavorite={() => handleToggleFavorite(item, tab)}
              toggling={togglingIds.has(item.voice_id)}
              onEdit={tab === 'myVoices' && !isPreset ? () => handleEdit(item) : undefined}
              tab={tab}
            />
          )
        })}
        {totalCount > pageSize && (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '16px', paddingBottom: '8px' }}>
            <Pagination
              current={currentPage}
              total={totalCount}
              pageSize={pageSize}
              pageSizeOptions={['20', '50', '100', '200']}
              onChange={(page, size) => {
                setCurrentPage(page)
                if (size !== pageSize) setPageSize(size)
              }}
              size="small"
              showTotal={(t) => `共 ${t} 条`}
            />
          </div>
        )}
      </>
    )
  }

  const hasFilter = Object.keys(currentFilter).length > 0

  // 当前 tab 是否正在加载 — 决定刷新按钮是否 disable + 旋转
  const currentTabLoading =
    tab === 'library' ? libraryLoading
      : tab === 'myVoices' ? myVoicesLoading
        : favoritesLoading

  // 刷新当前 tab 数据 — library 走 force, myVoices/favorites 重置 loaded flag 触发现有 effect 重拉
  const handleRefresh = () => {
    if (currentTabLoading) return
    if (tab === 'library') {
      setLibraryRefreshTick(t => t + 1)
    } else if (tab === 'myVoices') {
      setMyVoicesLoaded(false)
    } else if (tab === 'favorites') {
      setFavoritesLoaded(false)
    }
  }

  return (
    <>
      <Modal
        open
        title="选择音色"
        onCancel={onClose}
        footer={null}
        width={640}
        destroyOnHidden
        className="ms-dp-voice-picker-modal"
      >
        <div className="ms-dp-voice-picker-top">
          <Input
            prefix={<Search size={14} />}
            placeholder="搜索音色名 / ID / 标签"
            value={search}
            onChange={e => setSearch(e.target.value)}
            allowClear
            className="ms-dp-voice-picker-search"
          />
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {caps.cloneVoices && (
              <Button
                icon={<Mic size={14} />}
                onClick={() => setCloneOpen(true)}
                disabled={!projectId || !nodeId}
                title={!projectId || !nodeId ? '无法获取画布上下文' : ''}
              >
                克隆新音色
              </Button>
            )}
            <Badge
              count={hasFilter ? 1 : 0}
              size="small"
              color="#FF4D4F"
              offset={[-8, 8]}
            >
              <Button
                icon={<Filter size={18} />}
                onClick={() => setFilterOpen(true)}
                size="middle"
                type={hasFilter ? 'primary' : 'default'}
              />
            </Badge>
            {tab === 'library' && (
              <Segmented
                options={[
                  { label: '中文', value: 'zh' },
                  { label: 'English', value: 'en' },
                ]}
                value={lang}
                onChange={setLang}
                size="small"
              />
            )}
          </div>
        </div>

        <Tabs
          activeKey={tab}
          onChange={setTab}
          items={tabItems}
          tabBarExtraContent={
            <button
              type="button"
              className={`ms-dp-voice-picker-refresh${currentTabLoading ? ' loading' : ''}`}
              onClick={handleRefresh}
              disabled={currentTabLoading}
              title="刷新当前列表"
              aria-label="刷新"
            >
              <RotateCw size={14} className={currentTabLoading ? 'icon-spin' : ''} />
            </button>
          }
        />

        <div className="ms-dp-voice-picker-list">
          {tab === 'library' && renderList(getPagedList(filteredLibrary), libraryLoading, libraryError, filteredLibrary.length)}
          {tab === 'myVoices' && renderList(getPagedList(filteredMyVoices), myVoicesLoading, myVoicesError, filteredMyVoices.length)}
          {tab === 'favorites' && renderList(getPagedList(filteredFavorites), favoritesLoading, favoritesError, filteredFavorites.length)}
        </div>
      </Modal>

      <VoiceFilterModal
        open={filterOpen}
        initialValue={currentFilter}
        voices={
          tab === 'library' ? libraryItems
            : tab === 'myVoices' ? myVoicesData
              : mergedFavorites
        }
        onClose={() => setFilterOpen(false)}
        onApply={(filter) => {
          setCurrentFilter(filter)
          setFilterOpen(false)
        }}
      />

      <EditVoiceModal
        open={editOpen}
        voice={editingVoice}
        onClose={() => { setEditOpen(false); setEditingVoice(null) }}
        onSuccess={(updated) => {
          setMyVoicesData(prev => prev.map(v => v.voice_id === updated.voice_id ? updated : v))
        }}
      />

      <CloneVoiceModal
        open={cloneOpen}
        projectId={projectId}
        nodeId={nodeId}
        onClose={() => setCloneOpen(false)}
        onSuccess={() => {
          // 刷新「我的音色」列表 + 切到那个 tab
          setMyVoicesLoaded(false)
          setTab('myVoices')
          setCloneOpen(false)
        }}
      />
    </>
  )
}

function VoicePickerRow({ item, selected, favorited, onClick, onPlay, playing, onToggleFavorite, toggling, onEdit, tab }) {
  const tags = Array.isArray(item.tag_list) ? item.tag_list.slice(0, 3) : []
  // 名字右侧的属性 chip — 按 gender → age → language 顺序展示, 缺失字段跳过
  const nameChips = [item.gender, item.age, item.language].filter(v => typeof v === 'string' && v.trim())

  return (
    <div
      className={`ms-dp-voice-picker-row${selected ? ' selected' : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
    >
      <div className="ms-dp-voice-picker-cover">
        {item.cover_url
          ? <VoiceCover url={item.cover_url} />
          : <span aria-hidden="true">🎙️</span>}
      </div>
      <div className="ms-dp-voice-picker-info">
        <div className="ms-dp-voice-picker-name-row">
          <span className="ms-dp-voice-picker-name">{item.voice_name}</span>
          {nameChips.length > 0 && (
            <span className="ms-dp-voice-picker-name-chips">
              {nameChips.map(c => (
                <span key={c} className="ms-dp-voice-picker-name-chip">{c}</span>
              ))}
            </span>
          )}
        </div>
        <div className="ms-dp-voice-picker-meta">
          <span className="ms-dp-voice-picker-vid">{item.voice_id}</span>
          {tags.map(t => (
            <span key={t} className="ms-dp-voice-picker-tag">{t}</span>
          ))}
        </div>
      </div>
      {onEdit && (
        <button
          type="button"
          className="ms-dp-voice-picker-edit"
          onClick={(e) => { e.stopPropagation(); onEdit() }}
          aria-label="编辑音色"
          style={{
            flex: 'none',
            background: 'transparent',
            border: 0,
            cursor: 'pointer',
            padding: '0 6px',
            color: 'var(--ac-text-secondary, #999)',
            display: 'inline-flex',
            alignItems: 'center',
          }}
        >
          <Pencil size={14} />
        </button>
      )}
      {onToggleFavorite && (
        <button
          type="button"
          className="ms-dp-voice-picker-fav"
          onClick={(e) => { e.stopPropagation(); onToggleFavorite() }}
          disabled={toggling}
          aria-label={favorited ? '取消收藏' : '收藏'}
          aria-pressed={favorited}
          style={{
            flex: 'none',
            background: 'transparent',
            border: 0,
            cursor: toggling ? 'wait' : 'pointer',
            padding: '0 6px',
            color: favorited ? '#F59E0B' : 'var(--ac-text-secondary, #999)',
            display: 'inline-flex',
            alignItems: 'center',
            opacity: toggling ? 0.5 : 1,
          }}
        >
          <Star size={18} fill={favorited ? 'currentColor' : 'none'} />
        </button>
      )}
      {onPlay && (
        <button
          type="button"
          className="ms-dp-voice-picker-play"
          onClick={(e) => { e.stopPropagation(); onPlay() }}
          aria-label={playing ? '暂停' : '试听'}
        >
          {playing ? <PauseCircle size={16} /> : <PlayCircle size={16} />}
        </button>
      )}
      {selected && (
        <span className="ms-dp-voice-picker-row-selected-badge" title="当前使用" aria-label="当前使用">
          <Check size={14} />
        </span>
      )}
    </div>
  )
}
