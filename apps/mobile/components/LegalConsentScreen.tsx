import { useState } from "react";
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View, StyleSheet } from "react-native";
import { supabase } from "../lib/supabase";

export type MobileLegalDocument = { id: string; documentType: "terms" | "privacy"; title: string; version: string; content: string; effectiveAt: string | null };

export default function LegalConsentScreen({ documents, onAccepted, onSignOut }: {
  documents: MobileLegalDocument[];
  onAccepted: () => void;
  onSignOut: () => void;
}) {
  const [checked, setChecked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function accept() {
    if (checked.length !== documents.length || documents.length < 2) return;
    setBusy(true); setError("");
    const { error: acceptError } = await supabase.rpc("accept_legal_documents", {
      p_document_ids: documents.map((document) => document.id),
      p_source: "mobile",
    });
    if (acceptError) {
      setError("Your acceptance could not be saved. Please try again.");
      setBusy(false);
      return;
    }
    onAccepted();
    setBusy(false);
  }

  return <View style={styles.page}>
    <Text style={styles.eyebrow}>ACTION REQUIRED</Text>
    <Text style={styles.title}>Review our legal documents</Text>
    <Text style={styles.copy}>Read and accept the current Terms and Conditions and Privacy Policy to continue using Cities Builder Nest.</Text>
    {documents.map((document) => <View key={document.id} style={styles.card}>
      <Text style={styles.documentTitle}>{document.title}</Text>
      <Text style={styles.version}>VERSION {document.version}</Text>
      <ScrollView style={styles.documentScroll} nestedScrollEnabled>
        <Text selectable style={styles.documentText}>{document.content}</Text>
      </ScrollView>
      <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{ checked: checked.includes(document.id) }} onPress={() => setChecked((current) => current.includes(document.id) ? current.filter((id) => id !== document.id) : [...current, document.id])} style={styles.checkRow}>
        <View style={[styles.checkbox, checked.includes(document.id) && styles.checkboxChecked]}>{checked.includes(document.id) && <Text style={styles.checkmark}>✓</Text>}</View>
        <Text style={styles.checkText}>I have read and agree to the {document.documentType === "terms" ? "Terms and Conditions" : "Privacy Policy"}.</Text>
      </TouchableOpacity>
    </View>)}
    {!!error && <Text style={styles.error}>{error}</Text>}
    <TouchableOpacity disabled={busy || checked.length !== documents.length || documents.length < 2} onPress={() => void accept()} style={[styles.acceptButton, (busy || checked.length !== documents.length || documents.length < 2) && styles.disabled]}>
      {busy ? <ActivityIndicator color="#071A3A"/> : <Text style={styles.acceptText}>Accept and continue</Text>}
    </TouchableOpacity>
    <TouchableOpacity onPress={onSignOut} style={styles.signOut}><Text style={styles.signOutText}>Sign out</Text></TouchableOpacity>
    <Text style={styles.note}>Your acceptance is recorded against the exact document versions shown above.</Text>
  </View>;
}

const styles = StyleSheet.create({
  page:{gap:13,backgroundColor:"#080808",padding:18,borderRadius:18,minHeight:500},
  eyebrow:{fontSize:10,color:"#D4A84B",fontWeight:"900",letterSpacing:1.6},
  title:{fontSize:24,lineHeight:30,color:"#FFFFFF",fontWeight:"900"},
  copy:{fontSize:12,lineHeight:19,color:"#C5C5C5"},
  card:{backgroundColor:"#171717",borderWidth:1,borderColor:"#403622",borderRadius:13,padding:13,gap:10},
  documentTitle:{fontSize:14,color:"#FFFFFF",fontWeight:"900"},
  version:{fontSize:9,color:"#D4A84B",fontWeight:"900",letterSpacing:1},
  documentScroll:{maxHeight:240,borderWidth:1,borderColor:"#3B3B3B",borderRadius:8,padding:10,backgroundColor:"#101010"},
  documentText:{fontSize:11,lineHeight:18,color:"#E2E2E2"},
  checkRow:{flexDirection:"row",alignItems:"center",gap:10,paddingVertical:5},
  checkbox:{width:21,height:21,borderWidth:1,borderColor:"#D4A84B",borderRadius:5,alignItems:"center",justifyContent:"center"},
  checkboxChecked:{backgroundColor:"#D4A84B"},
  checkmark:{fontSize:14,color:"#17130B",fontWeight:"900"},
  checkText:{flex:1,fontSize:11,lineHeight:17,color:"#FFFFFF"},
  acceptButton:{minHeight:48,backgroundColor:"#D4A84B",borderRadius:10,alignItems:"center",justifyContent:"center"},
  acceptText:{fontSize:13,color:"#17130B",fontWeight:"900"},
  disabled:{opacity:.5},
  error:{fontSize:11,color:"#FF9292"},
  signOut:{alignItems:"center",paddingVertical:8},
  signOutText:{fontSize:11,color:"#D4A84B",fontWeight:"800"},
  note:{fontSize:9,lineHeight:15,color:"#999",textAlign:"center"}
});
