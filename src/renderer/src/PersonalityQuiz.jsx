import { useMemo, useState } from "react";
import {
  DEFAULT_PERSONALITY_ANSWERS,
  PERSONALITY_SLIDERS,
  derivePersonality,
  normalizePersonalityAnswers,
} from "../../shared/personality.js";

function PersonalityQuiz({
  initialAnswers,
  title = "personality quiz",
  saveLabel = "wake buddy",
  onSave,
  onCancel,
  required = false,
}) {
  const [answers, setAnswers] = useState(() =>
    normalizePersonalityAnswers(initialAnswers ?? DEFAULT_PERSONALITY_ANSWERS),
  );
  const profile = useMemo(() => derivePersonality(answers), [answers]);

  const updateAnswer = (id, value) => {
    setAnswers((current) => ({
      ...current,
      [id]: Number(value),
    }));
  };

  const save = () => {
    onSave?.({
      personalityAnswers: normalizePersonalityAnswers(answers),
      personalityProfile: profile,
    });
  };

  return (
    <div className="personality-panel">
      <div className="settings-title">{title}</div>
      <div className="personality-result">
        <div className="personality-name">{profile.name}</div>
        <div className="personality-meta">
          {profile.familyLabel} / {profile.mbti}
        </div>
      </div>
      <div className="personality-sliders">
        {PERSONALITY_SLIDERS.map((slider) => (
          <label className="personality-slider" key={slider.id}>
            <span className="slider-title">{slider.label}</span>
            <input
              type="range"
              min="0"
              max="100"
              value={answers[slider.id]}
              onChange={(event) => updateAnswer(slider.id, event.target.value)}
            />
            <span className="slider-ends">
              <span>{slider.left}</span>
              <span>{slider.right}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="personality-traits">{profile.traits.slice(0, 3).join(" / ")}</div>
      <div className="settings-actions">
        {!required && (
          <button type="button" className="settings-button secondary" onClick={onCancel}>
            cancel
          </button>
        )}
        <button type="button" className="settings-button" onClick={save}>
          {required ? "done" : saveLabel}
        </button>
      </div>
    </div>
  );
}

export default PersonalityQuiz;
