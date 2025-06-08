'use client'

import { useState, useEffect } from 'react'
import supabase from '@/lib/supabaseBrowser'
import { toast } from 'sonner'

type MeetingType = {
  id: string
  name: string
}

/**
 * 会議種類取得用のカスタムフック
 */
export const useMeetingTypes = () => {
  const [meetingTypes, setMeetingTypes] = useState<MeetingType[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    const fetchMeetingTypes = async () => {
      setLoading(true)
      
      try {
        const { data, error } = await supabase
          .from('meeting_types')
          .select('*')
          .order('name')
          
        if (error) throw error
        
        setMeetingTypes(data as MeetingType[])
      } catch (err) {
        console.error('会議種類の取得に失敗しました:', err)
        setError(err instanceof Error ? err : new Error('会議種類の取得に失敗しました'))
        toast.error('会議種類の取得に失敗しました')
      } finally {
        setLoading(false)
      }
    }
    
    fetchMeetingTypes()
  }, [])

  return { meetingTypes, loading, error }
}

export default useMeetingTypes 