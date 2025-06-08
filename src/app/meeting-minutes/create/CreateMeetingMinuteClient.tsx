// src/app/meeting-minutes/create/CreateMeetingMinuteClient.tsx
'use client';

import React from 'react';
import InfoStep from './steps/InfoStep';
import RecordStep from './steps/RecordStep';
import TranscriptStep from './steps/TranscriptStep';
import EditStep from './steps/EditStep';
import useMeetingCreator from './hooks/useMeetingCreator';

export default function CreateMeetingMinuteClient() {
  const { state, actions } = useMeetingCreator();

  switch (state.currentStep) {
    case 'info': {
      return (
        <InfoStep
          title={state.title}
          meetingTypeId={state.meetingTypeId}
          meetingTypes={state.meetingTypes}
          loadingTypes={state.loadingTypes}
          meetingDate={state.meetingDate}
          attendees={state.attendees}
          accessLevel={state.accessLevel}
          generatedTitle={state.generatedTitle}
          isLoading={state.submitting}
          setTitle={actions.setTitle}
          setMeetingTypeId={actions.setMeetingTypeId}
          setMeetingDate={actions.setMeetingDate}
          setAttendees={actions.setAttendees}
          setAccessLevel={actions.setAccessLevel}
          nextStep={actions.nextStep}
          prevStep={actions.prevStep}
        />
      );
    }

    case 'record': {
      return (
        <RecordStep
          isRecording={state.isRecording}
          duration={state.duration}
          blob={state.blob}
          audioRef={state.audioRef}
          audioUrl={state.audioUrl ?? ''}
          isPlaying={state.isPlaying}

          isUploading={state.submitting}
          isProcessing={state.submitting}
          isLoading={state.submitting}

          progress={state.progress}
          formatTime={actions.formatTime}
          startRecording={actions.startRecording}
          stopRecording={actions.stopRecording}
          deleteRecording={actions.deleteRecording}
          togglePlayback={actions.togglePlayback}
          processAudio={actions.processAudio}

          nextStep={actions.nextStep}
          prevStep={actions.prevStep}
        />
      );
    }

    case 'transcript': {
      return (
        <TranscriptStep
          transcriptionText={state.transcriptionText}
          isProcessing={state.submitting}
          isLoading={state.submitting}
          saveSuccess={state.saveSuccess}
          nextStep={actions.nextStep}
          prevStep={actions.prevStep}
          processAudio={actions.processAudio}
        />
      );
    }

    case 'edit': {
      return (
        <EditStep
          transcriptionText={state.transcriptionText}
          isLoading={state.submitting}
          prevStep={actions.prevStep}
          saveMeetingMinute={actions.saveMeetingMinute}
        />
      );
    }

    default:
      return null;
  }
}