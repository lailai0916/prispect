import idleFish from './assets/assistant-fish-idle.webp';
import happyFish from './assets/assistant-fish-happy.webp';

export function AssistantFish({ happy = false }: { happy?: boolean }) {
  return (
    <span className="assistant-fish" data-happy={happy} aria-hidden="true">
      <img className="assistant-fish-idle" src={idleFish} alt="" draggable={false} />
      <img className="assistant-fish-happy" src={happyFish} alt="" draggable={false} />
    </span>
  );
}
