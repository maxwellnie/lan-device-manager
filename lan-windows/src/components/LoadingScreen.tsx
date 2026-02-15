import "./LoadingScreen.css";

interface LoadingScreenProps {
  isLoading: boolean;
}

export default function LoadingScreen({ isLoading }: LoadingScreenProps) {
  if (!isLoading) return null;

  return (
    <div className={`loading-screen ${!isLoading ? "fade-out" : ""}`}>
      <div className="loading-content">
        <div className="loading-logo">
          <span className="material-icon">lan</span>
        </div>
        <div className="loading-text">
          <h2>LanDevice Manager</h2>
          <p>Loading configuration...</p>
        </div>
        <div className="loading-spinner"></div>
        <div className="loading-progress">
          <div className="loading-progress-bar"></div>
        </div>
      </div>
    </div>
  );
}
