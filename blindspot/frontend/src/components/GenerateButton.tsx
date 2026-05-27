interface GenerateButtonProps {
  generating: boolean;
  disabled: boolean;
  onClick: () => void;
}

export default function GenerateButton({
  generating,
  disabled,
  onClick,
}: GenerateButtonProps) {
  return (
    <button
      className="generate-btn"
      disabled={disabled || generating}
      onClick={onClick}
    >
      {generating ? "Running pipeline..." : "Run Pipeline"}
    </button>
  );
}
