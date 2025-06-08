'use client'

import { useState, useCallback } from 'react'
import supabase from '@/lib/supabaseBrowser'

/**
 * 議事録音声アップロード用のカスタムフック
 */
export const useMinuteUploader = () => {
  const [isUploading, setIsUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<Error | null>(null)

  /**
   * Storage にファイルをアップロード
   */
  const upload = useCallback(
    async ({ blob, path }: { blob: Blob; path: string }): Promise<string> => {
      setIsUploading(true)
      setProgress(0)
      setError(null)

      try {
        // Supabase Storage へアップロード
        const { error } = await supabase.storage
          .from('minutesaudio')
          .upload(path, blob, {
            upsert: true,
            contentType: blob.type,
          })

        if (error) throw error

        setProgress(100)
        return path
      } catch (err) {
        setError(err instanceof Error ? err : new Error('アップロードに失敗しました'))
        throw err
      } finally {
        setIsUploading(false)
      }
    },
    []
  )

  return { upload, isUploading, progress, error }
}

export default useMinuteUploader 