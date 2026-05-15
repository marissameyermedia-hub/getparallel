import { useState } from "react";
import { projectId, publicAnonKey } from "../../utils/supabase/info";
import { MISC_FUNCTION_URL } from "../../utils/supabase/client";

interface PromoCodeInputProps {
  onSuccess?: () => void;
}

export function PromoCodeInput({ onSuccess }: PromoCodeInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleRedeem = async () => {
    if (!code.trim()) {
      setError("Please enter a promo code");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const accessToken = localStorage.getItem("parallel_access_token");

      if (!accessToken) {
        setError("Please sign in to redeem a promo code");
        setLoading(false);
        return;
      }

      const response = await fetch(
        `${MISC_FUNCTION_URL}/promo/redeem`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
            apikey: publicAnonKey,
          },
          body: JSON.stringify({ code: code.trim() }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || data.message || "Could not redeem code");
        setLoading(false);
        return;
      }

      setSuccess(data.message || "Promo code redeemed!");
      setCode("");

      setTimeout(() => {
        if (onSuccess) {
          onSuccess();
        } else {
          window.location.reload();
        }
      }, 1500);
    } catch (err) {
      console.error("[Promo] Redeem error:", err);
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="text-sm text-gray-500 hover:text-gray-700 underline mt-4"
      >
        Have a promo code?
      </button>
    );
  }

  return (
    <div className="mt-4 p-4 border border-gray-200 rounded-lg bg-gray-50">
      <div className="flex items-center justify-between mb-3">
        <label className="text-sm font-medium text-gray-700">
          Enter promo code
        </label>
        <button
          onClick={() => {
            setIsOpen(false);
            setCode("");
            setError(null);
            setSuccess(null);
          }}
          className="text-gray-500 hover:text-gray-600 text-sm"
          disabled={loading}
        >
          Cancel
        </button>
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase());
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !loading) {
              handleRedeem();
            }
          }}
          placeholder="FOUNDING100"
          className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black uppercase tracking-wide"
          disabled={loading || !!success}
          autoFocus
          maxLength={32}
        />
        <button
          onClick={handleRedeem}
          disabled={loading || !code.trim() || !!success}
          className="px-4 py-2 bg-parallel-purple text-parallel-cream rounded-md hover:bg-parallel-purple/90 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm font-medium"
        >
          {loading ? "Redeeming..." : "Redeem"}
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-600 mt-2" role="alert">
          {error}
        </p>
      )}

      {success && (
        <p className="text-sm text-green-700 mt-2" role="status">
          ✓ {success}
        </p>
      )}
    </div>
  );
}
