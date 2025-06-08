'use client'

import { useState, useRef, useCallback } from 'react'

/**
 * 音声録音用のカスタムフック
 */
export const useRecorder = () => {
  const [isRecording, setIsRecording] = useState(false)
  const [duration, setDuration] = useState(0)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const timer = useRef<NodeJS.Timeout | null>(null)
  const mediaRecorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])

  /**
   * 録音を開始
   */
  const start = useCallback(async () => {
    try {
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      setStream(audioStream)
      mediaRecorder.current = new MediaRecorder(audioStream)
      mediaRecorder.current.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.current.push(e.data)
      }
      mediaRecorder.current.onstop = () => {
        const wavBlob = new Blob(chunks.current, { type: 'audio/webm' })
        setBlob(wavBlob)
        audioStream.getTracks().forEach((t) => t.stop())
        setStream(null)
      }
      mediaRecorder.current.start()
      setIsRecording(true)
      timer.current = setInterval(() => setDuration((d) => d + 1), 1_000)
    } catch (error) {
      console.error('録音の開始に失敗しました:', error)
      throw error
    }
  }, [])

  /**
   * 録音を停止
   */
  const stop = useCallback(() => {
    if (mediaRecorder.current) mediaRecorder.current.stop()
    if (timer.current) clearInterval(timer.current)
    setIsRecording(false)
  }, [])

  /**
   * 録音データをリセット
   */
  const reset = useCallback(() => {
    setBlob(null)
    setDuration(0)
    chunks.current = []
  }, [])

  return { isRecording, duration, blob, stream, start, stop, reset }
}

export default useRecorder 