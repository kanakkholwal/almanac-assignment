import { NotesPill } from "./NotesPill";

export function NotesView() {
  return (
    <div className="h-screen w-screen bg-transparent">
      <NotesPill
        recording
        onStop={() => void window.almanac?.notesStop()}
        onOpenChat={() => void window.almanac?.notesOpenChat()}
      />
    </div>
  );
}
