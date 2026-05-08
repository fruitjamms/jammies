import { useState, useEffect } from "react";
import PersonalityQuiz from "./PersonalityQuiz";
import "./assets/SettingsModal.css";

function SettingsModal({ isOpen, onClose }) {
  const [walkWhileTalking, setWalkWhileTalking] = useState(false);
  const [settings, setSettings] = useState({});
  const [editingPersonality, setEditingPersonality] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    window.api?.getSettings?.().then((settings) => {
      setSettings(settings || {});
      setWalkWhileTalking(settings.walkWhileTalking || false);
    });
    return undefined;
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) setEditingPersonality(false);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleBlur = () => onClose();
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("blur", handleBlur);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  const handleWalkWhileTalkingChange = () => {
    const newValue = !walkWhileTalking;
    setWalkWhileTalking(newValue);
    setSettings((current) => ({ ...current, walkWhileTalking: newValue }));
    window.api?.updateSettings?.({ walkWhileTalking: newValue });
  };

  const handlePersonalitySave = (patch) => {
    setSettings((current) => ({ ...current, ...patch }));
    window.api?.updateSettings?.(patch);
    setEditingPersonality(false);
  };

  const handleResetToEgg = () => {
    window.api?.resetToEgg?.();
    onClose();
  };

  const handleOverlayPointerDown = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="settings-modal-overlay" onPointerDown={handleOverlayPointerDown}>
      <div className="settings-modal-content">
        {editingPersonality ? (
          <PersonalityQuiz
            initialAnswers={settings.personalityAnswers}
            title="tune personality"
            saveLabel="save"
            onSave={handlePersonalitySave}
            onCancel={() => setEditingPersonality(false)}
          />
        ) : (
          <div>
            <div className="settings-header">
              <div className="settings-title">settings</div>
              <button
                type="button"
                className="settings-close"
                aria-label="close settings"
                onClick={onClose}
              >
                x
              </button>
            </div>
            <div className="settings-list">
              <div className="settings-option" onClick={handleWalkWhileTalkingChange}>
                <span>walk while talking</span>
                <span className="toggle">{walkWhileTalking ? "on" : "off"}</span>
              </div>
              <div className="settings-option" onClick={() => setEditingPersonality(true)}>
                <span>personality</span>
                <span className="settings-value">
                  {settings.personalityProfile?.name ?? "unset"}
                </span>
              </div>
              <div className="settings-option" onClick={handleResetToEgg}>
                <span>reset to egg</span>
                <span className="arrow">→</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default SettingsModal;
