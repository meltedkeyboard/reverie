import { useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'

import {
  inspectLoadedModel,
  listLoadedModels,
  loadModel,
  unloadAllModels,
  unloadSingleModel,
  type LoadedModelEntry,
  type LoadedModelInfo,
} from '@/api/llm'
import type { ServerProfile } from '@/db/prefs/settings'
import { useServerForm } from '@/hooks/features/useServerForm'
import { useTranslation } from '@/i18n'
import { showSheet } from '@/lib/ui/dialogs'
import { notificationAsync, NotificationFeedbackType, selectionAsync } from '@/lib/ui/haptics'
import { reportError } from '@/lib/transfer/report'

function isNameMatch(first: string, second: string) {
  if (!first.trim() || !second.trim()) return false
  const normFirst = first.trim().toLowerCase()
  const normSecond = second.trim().toLowerCase()
  if (normFirst === normSecond) return true
  const baseFirst = normFirst.split('/').pop()?.replace(/\.gguf$/i, '') ?? normFirst
  const baseSecond = normSecond.split('/').pop()?.replace(/\.gguf$/i, '') ?? normSecond
  if (baseFirst === baseSecond) return true
  const tagFirst = baseFirst.split(':')[0]
  const tagSecond = baseSecond.split(':')[0]
  return tagFirst === tagSecond
}

// At most one model can ever be the active chat model in the UI.
function activeIndexOf(cfg: ServerProfile, loadedModels: LoadedModelEntry[]) {
  if (!cfg.model.trim() || loadedModels.length === 0) return -1
  const target = cfg.model.trim().toLowerCase()

  // 1. Match both model name/id AND context length (distinguishes instances of same model)
  const exactContextIndex = loadedModels.findIndex(
    (entry) =>
      (entry.key.toLowerCase() === target || entry.id.toLowerCase() === target) &&
      entry.contextLength === cfg.contextTokens
  )
  if (exactContextIndex !== -1) return exactContextIndex

  // 2. Exact match by id
  const exactIdIndex = loadedModels.findIndex((entry) => entry.id.toLowerCase() === target)
  if (exactIdIndex !== -1) return exactIdIndex

  // 3. Exact match by key
  const exactKeyIndex = loadedModels.findIndex((entry) => entry.key.toLowerCase() === target)
  if (exactKeyIndex !== -1) return exactKeyIndex

  // 4. Exact match ignoring path prefix or .gguf extension
  const normalizeModelName = (name: string) =>
    name.split('/').pop()?.replace(/\.gguf$/i, '').toLowerCase() ?? name.toLowerCase()
  const targetNormalized = normalizeModelName(target)
  const baseIndex = loadedModels.findIndex(
    (entry) => normalizeModelName(entry.key) === targetNormalized || normalizeModelName(entry.id) === targetNormalized
  )
  if (baseIndex !== -1) return baseIndex

  // 5. Exact match ignoring tag (e.g. "llama3:latest" vs "llama3")
  const stripModelTag = (name: string) => name.split(':')[0].toLowerCase()
  const targetWithoutTag = stripModelTag(target)
  const tagIndex = loadedModels.findIndex(
    (entry) => stripModelTag(entry.key) === targetWithoutTag || stripModelTag(entry.id) === targetWithoutTag
  )
  if (tagIndex !== -1) return tagIndex

  // 6. Single unambiguous prefix match
  const prefixIndices: number[] = []
  loadedModels.forEach((entry, idx) => {
    const key = entry.key.toLowerCase()
    const id = entry.id.toLowerCase()
    if (key.startsWith(target) || id.startsWith(target) || target.startsWith(key) || target.startsWith(id)) {
      prefixIndices.push(idx)
    }
  })
  if (prefixIndices.length === 1) {
    return prefixIndices[0]
  }

  return -1
}

// A server's fields together with what its screen shows of the models on it: which are
// loaded, which is the one replies use, and loading and unloading them. The list is asked
// for again every few seconds while the screen is in view.
export function useServerModels(serverId?: string) {
  const { t } = useTranslation()
  // The context slider shows once the model is loaded; another server or model starts over.
  const [loadingModel, setLoadingModel] = useState(false)
  const loadingModelRef = useRef(false)
  const [modelLoaded, setModelLoaded] = useState(false)
  const [loadedModelInfo, setLoadedModelInfo] = useState<LoadedModelInfo | null>(null)
  const [loadedModels, setLoadedModels] = useState<LoadedModelEntry[]>([])
  const [selectedModelIndex, setSelectedModelIndex] = useState<number | null>(null)
  const [unloadingModelIds, setUnloadingModelIds] = useState<Set<string>>(new Set())
  const [unloadingAll, setUnloadingAll] = useState(false)
  const form = useServerForm(serverId, () => {
    setModelLoaded(false)
    setLoadedModelInfo(null)
  })
  const { cfg, loaded, update, onTest: runTest } = form

  const cfgRef = useRef(cfg)
  cfgRef.current = cfg

  const checkModelStatus = useCallback(async (currentCfg: ServerProfile, fresh = false) => {
    if (loadingModelRef.current) return
    if (!currentCfg.baseUrl.trim()) {
      setLoadedModelInfo(null)
      setModelLoaded(false)
      setLoadedModels([])
      return
    }
    try {
      const [info, list] = await Promise.all([
        inspectLoadedModel(currentCfg, fresh),
        listLoadedModels(currentCfg, fresh),
      ])
      if (loadingModelRef.current) return
      setLoadedModelInfo(info)
      setModelLoaded(info.isLoaded || list.length > 0)
      setLoadedModels(list)
    } catch {
      // Ignore background probe errors
    }
  }, [])

  useEffect(() => {
    if (!loaded) return
    checkModelStatus(cfg)
  }, [loaded, cfg.baseUrl, cfg.model, checkModelStatus])

  useFocusEffect(
    useCallback(() => {
      if (!loaded) return
      checkModelStatus(cfgRef.current, true)
      const interval = setInterval(() => {
        checkModelStatus(cfgRef.current, true)
      }, 3000)
      return () => clearInterval(interval)
    }, [loaded, checkModelStatus]),
  )

  const onTest = async () => {
    const found = await runTest()
    if (found.length === 1 && !found.includes(cfg.model)) {
      update({ model: found[0] })
      checkModelStatus({ ...cfg, model: found[0] }, true)
    } else if (cfg.model.trim()) {
      checkModelStatus(cfg, true)
    }
  }

  const executeLoadModel = async (replace: boolean, targetModel?: string) => {
    const modelToLoad = targetModel ?? cfg.model
    const configToLoad = targetModel ? { ...cfg, model: targetModel } : cfg
    setLoadingModel(true)
    loadingModelRef.current = true
    try {
      const result = await loadModel(configToLoad, { replace })
      setSelectedModelIndex(null)
      setModelLoaded(true)
      setLoadedModelInfo({
        isLoaded: true,
        loadedContextLength: result?.loadedContextLength ?? configToLoad.contextTokens,
        modelName: modelToLoad,
      })
      const patch: Partial<ServerProfile> = {}
      if (targetModel && targetModel !== cfg.model) {
        patch.model = targetModel
      }
      if (result?.loadedContextLength && result.loadedContextLength > 0) {
        patch.contextTokens = result.loadedContextLength
      }
      if (Object.keys(patch).length > 0) {
        update(patch)
      }
      notificationAsync(NotificationFeedbackType.Success)
      await checkModelStatus(configToLoad, true)
    } catch (err) {
      notificationAsync(NotificationFeedbackType.Error)
      reportError(t('settings.loadModelFailed'), err)
    } finally {
      loadingModelRef.current = false
      setLoadingModel(false)
    }
  }

  const computedActiveIndex = activeIndexOf(cfg, loadedModels)
  const activeLoadedModelIndex =
    selectedModelIndex !== null && selectedModelIndex >= 0 && selectedModelIndex < loadedModels.length
      ? selectedModelIndex
      : computedActiveIndex

  const onSelectActiveModel = (entry: LoadedModelEntry, index: number) => {
    if (unloadingModelIds.has(entry.id)) return
    selectionAsync()
    setSelectedModelIndex(index)
    const modelName = entry.key || entry.id
    const patch: Partial<ServerProfile> = { model: modelName }
    if (typeof entry.contextLength === 'number' && entry.contextLength > 0) {
      patch.contextTokens = entry.contextLength
    }
    update(patch)
  }

  const isSelectedModelLoaded = Boolean(
    cfg.model.trim() &&
      (activeLoadedModelIndex !== -1 ||
        (modelLoaded &&
          loadedModelInfo?.modelName &&
          isNameMatch(loadedModelInfo.modelName, cfg.model)))
  )

  const onUnloadSingle = async (entry: LoadedModelEntry) => {
    setUnloadingModelIds((prev) => new Set(prev).add(entry.id))
    try {
      await unloadSingleModel(cfg, entry)
      setSelectedModelIndex(null)
      notificationAsync(NotificationFeedbackType.Success)
      const remaining = loadedModels.filter((m) => m.id !== entry.id)
      if (isNameMatch(entry.key, cfg.model) || isNameMatch(entry.id, cfg.model)) {
        if (remaining.length > 0) {
          const nextModel = remaining[0]
          const patch: Partial<ServerProfile> = { model: nextModel.key || nextModel.id }
          if (typeof nextModel.contextLength === 'number' && nextModel.contextLength > 0) {
            patch.contextTokens = nextModel.contextLength
          }
          update(patch)
        }
      }
      await checkModelStatus(cfg, true)
    } catch (err) {
      notificationAsync(NotificationFeedbackType.Error)
      reportError(t('settings.loadModelFailed'), err)
    } finally {
      setUnloadingModelIds((prev) => {
        const next = new Set(prev)
        next.delete(entry.id)
        return next
      })
    }
  }

  const onUnloadAll = async () => {
    setUnloadingAll(true)
    try {
      await unloadAllModels(cfg)
      setSelectedModelIndex(null)
      notificationAsync(NotificationFeedbackType.Success)
      setLoadedModels([])
      setModelLoaded(false)
      setLoadedModelInfo(null)
      await checkModelStatus(cfg, true)
    } catch (err) {
      notificationAsync(NotificationFeedbackType.Error)
      reportError(t('settings.loadModelFailed'), err)
    } finally {
      setUnloadingAll(false)
    }
  }

  const onLoadModel = async () => {
    if (loadingModel || !cfg.baseUrl.trim() || !cfg.model.trim()) return

    const probe = await inspectLoadedModel(cfg, true).catch(() => null)
    const isCurrentlyLoaded = modelLoaded || Boolean(probe?.isLoaded || loadedModelInfo?.isLoaded)

    if (isCurrentlyLoaded) {
      showSheet(
        t('settings.loadModelConflictTitle'),
        [
          {
            label: t('settings.loadModelReplace'),
            destructive: true,
            onSelect: () => executeLoadModel(true),
          },
          {
            label: t('settings.loadModelAlongside'),
            onSelect: () => executeLoadModel(false),
          },
        ],
        { message: t('settings.loadModelConflictMessage') },
      )
      return
    }

    executeLoadModel(false)
  }

  const onSelectModel = async (newModel: string) => {
    if (loadingModel || newModel === cfg.model) return
    if (!cfg.baseUrl.trim() || !newModel.trim()) {
      update({ model: newModel })
      return
    }

    const alreadyLoaded = loadedModels.find(
      (m) => isNameMatch(m.key, newModel) || isNameMatch(m.id, newModel)
    )
    if (alreadyLoaded) {
      const patch: Partial<ServerProfile> = { model: newModel }
      if (typeof alreadyLoaded.contextLength === 'number' && alreadyLoaded.contextLength > 0) {
        patch.contextTokens = alreadyLoaded.contextLength
      }
      update(patch)
      setModelLoaded(true)
      return
    }

    const probe = await inspectLoadedModel(cfg, true).catch(() => null)
    const isCurrentlyLoaded = modelLoaded || Boolean(probe?.isLoaded || loadedModelInfo?.isLoaded)

    const isSameModelAndContext =
      probe?.isLoaded &&
      probe?.modelName &&
      (probe.modelName.toLowerCase() === newModel.toLowerCase() ||
        probe.modelName.toLowerCase().startsWith(newModel.toLowerCase()) ||
        newModel.toLowerCase().startsWith(probe.modelName.toLowerCase())) &&
      probe.loadedContextLength === cfg.contextTokens

    if (isSameModelAndContext) {
      update({ model: newModel })
      setModelLoaded(true)
      setLoadedModelInfo(probe)
      return
    }

    if (isCurrentlyLoaded) {
      showSheet(
        t('settings.loadModelConflictTitle'),
        [
          {
            label: t('settings.loadModelReplace'),
            destructive: true,
            onSelect: () => {
              update({ model: newModel })
              executeLoadModel(true, newModel)
            },
          },
          {
            label: t('settings.loadModelAlongside'),
            onSelect: () => {
              update({ model: newModel })
              executeLoadModel(false, newModel)
            },
          },
        ],
        { message: t('settings.loadModelConflictMessage') },
      )
      return
    }

    update({ model: newModel })
    checkModelStatus({ ...cfg, model: newModel }, true)
  }

  return {
    ...form,
    onTest,
    loadingModel,
    isLoaded: modelLoaded || Boolean(loadedModelInfo?.isLoaded),
    isSelectedModelLoaded,
    loadedModels,
    activeLoadedModelIndex,
    unloadingModelIds,
    unloadingAll,
    onLoadModel,
    onSelectModel,
    onSelectActiveModel,
    onUnloadSingle,
    onUnloadAll,
  }
}
