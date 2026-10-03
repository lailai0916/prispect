import idleCharacter from './assets/assistant-character-idle.webp';
import happyCharacter from './assets/assistant-character-happy.webp';

export function AssistantCharacter({ happy = false }: { happy?: boolean }) {
  return (
    <span className="assistant-character" data-happy={happy} aria-hidden="true">
      <span className="assistant-character-visual">
        <img className="assistant-character-idle" src={idleCharacter} alt="" draggable={false} />
        <img className="assistant-character-happy" src={happyCharacter} alt="" draggable={false} />
      </span>
    </span>
  );
}
