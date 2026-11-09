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
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
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
      const [{ data: profile, error: profileError }, { data: account, error: accountError }] = await Promise.all([
        supabase.from("users")
          .select("first_name,last_name,full_name,phone_e164,home_number,street_name,building_name,unit_number")
          .eq("id", userId).maybeSingle(),
        supabase.functions.invoke("management-update-resident", {
          body: { action: "load", estateId, userId },
        }),
      ]);

      if (!active) return;
      if (profileError || !profile || accountError) {
        setError(accountError?.message || "Resident details could not be loaded. Check your access and try again.");
        setLoading(false);
        return;
      }
      const nameParts = (profile.full_name || "").trim().split(/\s+/);
      setFirstName(profile.first_name || nameParts.shift() || "");
      setLastName(profile.last_name || nameParts.join(" "));
      setEmail(account?.email || "");
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
    if (!firstName.trim() || [firstName.trim(), lastName.trim()].join(" ").length < 2) {
      setError("Enter the resident's first name and, where applicable, last name.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Enter a valid email address. This is the resident's sign-in email.");
      return;
    }
    if (phone.trim() && phone.trim().length < 7) {
      setError("Enter a valid phone number, including the country code where possible.");
      return;
    }
    setSaving(true);
    const { data, error: saveError } = await supabase.functions.invoke("management-update-resident", {
      body: {
        action: "update",
        estateId,
        userId,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        homeNumber: homeNumber.trim(),
        streetName: streetName.trim(),
        buildingName: buildingName.trim(),
        unitNumber: unitNumber.trim(),
      },
    });
    if (saveError || data?.error) {
      setError(data?.message || data?.error || saveError?.message || "Resident details could not be saved. Please try again.");
      setSaving(false);
      return;
    }
    setSuccess(data?.emailUpdated
      ? "Resident profile and sign-in email have been updated."
      : "Resident profile has been updated.");
    setSaving(false);
  }

  return (
    <PortalFrame title="Edit Resident" description="Update the resident's account details and home address within this estate.">
      <section className="panel module-panel">
        <div className="module-toolbar">
          <div><h3>Resident profile</h3><p>Type every detail directly. No tenant, building or unit dropdowns are used on this form.</p></div>
          <button type="button" className="secondary-action" onClick={() => router.back()}>← Back to residents</button>
        </div>
        {error && <div className="user-alert user-alert-error" role="alert">{error}</div>}
        {success && <div className="user-alert user-alert-success" role="status">{success}</div>}
        {loading ? <p className="empty-cell">Loading resident details…</p> : (
          <form className="user-form" onSubmit={save}>
            <div className="user-form-heading"><strong>Personal details</strong><span>All fields are manually editable.</span></div>
            <div className="user-form-grid">
              <label>First name<input required maxLength={80} value={firstName} onChange={(event) => setFirstName(event.target.value)} autoComplete="given-name" /></label>
              <label>Last name<input maxLength={80} value={lastName} onChange={(event) => setLastName(event.target.value)} autoComplete="family-name" /></label>
              <label>Email address<input required type="email" maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></label>
              <label>Phone number<input type="tel" maxLength={20} value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" placeholder="+234…" /></label>
            </div>
            <div className="user-form-heading"><strong>Home address</strong><span>Type the address manually, even if the building or unit is not already in the estate records.</span></div>
            <div className="user-form-grid">
              <label>Home number / Apartment<input maxLength={80} value={homeNumber} onChange={(event) => setHomeNumber(event.target.value)} placeholder="e.g. House 12 or Flat 3B" /></label>
              <label>Street name<input maxLength={160} value={streetName} onChange={(event) => setStreetName(event.target.value)} placeholder="Type street name" /></label>
              <label>Building name<input maxLength={120} value={buildingName} onChange={(event) => setBuildingName(event.target.value)} placeholder="e.g. Block B" /></label>
              <label>Unit number<input maxLength={80} value={unitNumber} onChange={(event) => setUnitNumber(event.target.value)} placeholder="Type unit number" /></label>
            </div>
            <p className="notice-line">Building name and unit number are saved as typed resident address details. They do not create or reassign an inventory unit or affect another resident's assignment.</p>
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
