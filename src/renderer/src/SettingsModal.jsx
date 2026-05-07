import { useState, useEffect } from "react";
import "./assets/SettingsModal.css";

function SettingsModal({ isOpen, onClose }) {
  const [walkWhileTalking, setWalkWhileTalking] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    window.api?.getSettings?.().then((settings) => {
      setWalkWhileTalking(settings.walkWhileTalking || false);
    });
    return undefined;
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
    window.api?.updateSettings?.({ walkWhileTalking: newValue });
  };

  const handleResetToEgg = () => {
    if (confirm("back to egg?")) {
      window.api?.resetToEgg?.();
      onClose();
    }
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
        <div className="settings-title">settings</div>
        <div className="settings-list">
          <div className="settings-option" onClick={handleWalkWhileTalkingChange}>
            <span>walk while talking</span>
            <span className="toggle">{walkWhileTalking ? "on" : "off"}</span>
          </div>
          <div className="settings-option" onClick={handleResetToEgg}>
            <span>reset to egg</span>
            <span className="arrow">→</span>
          </div>
        </div>
        <div className="settings-hint">click elsewhere to close</div>
      </div>
    </div>
  );
}

export default SettingsModal;
