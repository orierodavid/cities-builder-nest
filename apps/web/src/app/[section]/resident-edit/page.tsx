"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PortalFrame from "@/components/PortalFrame";
import { supabase } from "@/lib/supabase";

export default function ResidentEditPage() {
  const router = useRouter();
  const [estateId, setEstateId] = useState("");
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [homeNumber, setHomeNumber] = useState("");
  const [streetName, setStreetName] = useState("");
  const [buildingName, setBuildingName] = useState("");
  const [unitNumber, setUnitNumber] = useState("");

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    setEstateId(query.get("estateId") || "");
    setUserId(query.get("userId") || "");
  }, []);

  useEffect(() => {
    if (!estateId && !userId) return;
    let active = true;
    async function load() {
      if (!estateId || !userId) {
        setError("The resident or estate details are missing. Return to the resident directory and try again.");
        setLoading(false);
        return;
      }
      const { data: profile, error: profileError } = await supabase
        .from("users")
        .select("full_name,phone_e164,home_number,street_name,building_name,unit_number")
        .eq("id", userId)
        .maybeSingle();

      if (!active) return;
      if (profileError || !profile) {
        setError("Resident details could not be loaded. Check your access and try again.");
        setLoading(false);
        return;
      }
      setFullName(profile.full_name || "");
      setPhone(profile.phone_e164 || "");
      setHomeNumber(profile.home_number || "");
      setStreetName(profile.street_name || "");
      setBuildingName(profile.building_name || "");
      setUnitNumber(profile.unit_number || "");
      setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, [estateId, userId]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (fullName.trim().length < 2) {
      setError("Enter the resident's full name.");
      return;
    }
    if (phone.trim() && phone.trim().length < 7) {
      setError("Enter a valid phone number, including the country code where possible.");
      return;
    }
    setSaving(true);
    const { error: saveError } = await supabase.rpc("management_update_resident_profile", {
      p_estate_id: estateId,
      p_resident_user_id: userId,
      p_full_name: fullName.trim(),
      p_phone_e164: phone.trim() || null,
      p_home_number: homeNumber.trim() || null,
      p_street_name: streetName.trim() || null,
      p_building_name: buildingName.trim() || null,
      p_unit_number: unitNumber.trim() || null
    });
    if (saveError) {
      setError(saveError.message || "Resident details could not be saved. Please try again.");
      setSaving(false);
      return;
    }
    setSuccess("Resident profile and typed property details have been updated.");
    setSaving(false);
  }

  return (
    <PortalFrame title="Edit Resident" description="Update the resident's contact details and home address within this estate.">
      <section className="panel module-panel">
        <div className="module-toolbar">
          <div><h3>Resident profile</h3><p>Enter the resident's details directly. You do not need to select an existing tenant, building or unit.</p></div>
          <button type="button" className="secondary-action" onClick={() => router.back()}>← Back to residents</button>
        </div>
        {error && <div className="user-alert user-alert-error" role="alert">{error}</div>}
        {success && <div className="user-alert user-alert-success" role="status">{success}</div>}
        {loading ? <p className="empty-cell">Loading resident details…</p> : (
          <form className="user-form" onSubmit={save}>
            <div className="user-form-heading"><strong>Personal details</strong><span>Correct the resident's name and contact number.</span></div>
            <div className="user-form-grid">
              <label>Full name<input required minLength={2} maxLength={120} value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" /></label>
              <label>Phone number<input type="tel" maxLength={20} value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" placeholder="+234…" /></label>
            </div>
            <div className="user-form-heading"><strong>Home address</strong><span>Type the resident's address manually. These fields are not restricted to existing building or tenant records.</span></div>
            <div className="user-form-grid">
              <label>Home number / Apartment<input maxLength={80} value={homeNumber} onChange={(event) => setHomeNumber(event.target.value)} placeholder="e.g. House 12 or Flat 3B" /></label>
              <label>Street name<input maxLength={160} value={streetName} onChange={(event) => setStreetName(event.target.value)} placeholder="Street name" /></label>
              <label>Building name<input maxLength={120} value={buildingName} onChange={(event) => setBuildingName(event.target.value)} placeholder="Type building name" /></label>
              <label>Unit number<input maxLength={80} value={unitNumber} onChange={(event) => setUnitNumber(event.target.value)} placeholder="Type unit number" /></label>
            </div>
            <p className="notice-line">Building name and unit number are saved as typed resident address details. They do not create or reassign an inventory unit, so editing one resident cannot take another resident's assigned unit.</p>
            <div className="user-form-actions">
              <button type="button" className="secondary-action" onClick={() => router.back()} disabled={saving}>Cancel</button>
              <button type="submit" className="primary-action" disabled={saving}>{saving ? "Saving changes…" : "Save changes"}</button>
            </div>
          </form>
        )}
      </section>
    </PortalFrame>
  );
}
