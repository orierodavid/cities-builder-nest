import { useState } from "react";
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View, StyleSheet, NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import { supabase } from "../lib/supabase";

export type MobileLegalDocument = { id: string; documentType: "terms" | "privacy"; title: string; version: string; content: string; effectiveAt: string | null };

export default function LegalConsentScreen({ documents, onAccepted, onSignOut }: {
  documents: MobileLegalDocument[];
  onAccepted: () => void;
  onSignOut: () => void;
}) {
  const [readToEnd, setReadToEnd] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function handleDocumentScroll(documentId: string, event: NativeSyntheticEvent<NativeScrollEvent>) {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 24) {
      setReadToEnd((current) => current.includes(documentId) ? current : [...current, documentId]);
    }
  }

  async function accept() {
    if (readToEnd.length !== documents.length || documents.length < 2 || busy) return;
    setBusy(true); setError("");
    const { error: acceptError } = await supabase.rpc("accept_legal_documents", {
      p_document_ids: documents.map((document) => document.id),
      p_source: "mobile",
    });
    if (acceptError) {
      setError("We couldn't save your acceptance. Please check your connection and try again.");
      setBusy(false);
      return;
    }
    onAccepted();
    setBusy(false);
  }

  return <View style={styles.page}>
    <Text style={styles.eyebrow}>ACTION REQUIRED</Text>
    <Text style={styles.title}>Welcome to CB Nest</Text>
    <Text style={styles.copy}>Before you continue, please read the current Terms and Conditions and Privacy Policy. Scroll to the end of each document to enable the acceptance button.</Text>
    {documents.map((document) => <View key={document.id} style={styles.card}>
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}>
          <Text style={styles.documentTitle}>{document.title}</Text>
          <Text style={styles.version}>VERSION {document.version}</Text>
        </View>
        {readToEnd.includes(document.id) ? <Text style={styles.readStatus}>READ ✓</Text> : <Text style={styles.scrollHint}>SCROLL TO END</Text>}
      </View>
      <ScrollView
        style={styles.documentScroll}
        nestedScrollEnabled
        showsVerticalScrollIndicator
        onScroll={(event) => handleDocumentScroll(document.id, event)}
        scrollEventThrottle={100}
      >
        <Text selectable style={styles.documentText}>{document.content}</Text>
        <Text style={styles.endMarker}>End of {document.title}</Text>
      </ScrollView>
    </View>)}
    {!!error && <Text style={styles.error}>{error}</Text>}
    <TouchableOpacity accessibilityRole="button" disabled={busy || readToEnd.length !== documents.length || documents.length < 2} onPress={() => void accept()} style={[styles.acceptButton, (busy || readToEnd.length !== documents.length || documents.length < 2) && styles.disabled]}>
      {busy ? <ActivityIndicator color="#17130B"/> : <Text style={styles.acceptText}>I Agree</Text>}
    </TouchableOpacity>
    <Text style={styles.note}>{readToEnd.length} of {documents.length} documents read. Your agreement will be securely recorded with the document versions and date.</Text>
    <TouchableOpacity onPress={onSignOut} style={styles.signOut}><Text style={styles.signOutText}>Sign out</Text></TouchableOpacity>
  </View>;
}

const styles = StyleSheet.create({
  page:{gap:13,backgroundColor:"#080808",padding:18,borderRadius:18,minHeight:500},
  eyebrow:{fontSize:10,color:"#D9A93F",fontWeight:"900",letterSpacing:1.6},
  title:{fontSize:24,lineHeight:30,color:"#FFFFFF",fontWeight:"900"},
  copy:{fontSize:12,lineHeight:19,color:"#C5C5C5"},
  card:{backgroundColor:"#121212",borderWidth:1,borderColor:"#3A2E12",borderRadius:13,padding:13,gap:10},
  headingRow:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:8},
  headingCopy:{flex:1,gap:4},
  documentTitle:{fontSize:14,color:"#FFFFFF",fontWeight:"900"},
  version:{fontSize:9,color:"#D9A93F",fontWeight:"900",letterSpacing:1},
  readStatus:{fontSize:9,color:"#2FB36D",fontWeight:"900"},
  scrollHint:{fontSize:8,color:"#D9A93F",fontWeight:"900"},
  documentScroll:{height:230,borderWidth:1,borderColor:"#3B3B3B",borderRadius:8,padding:10,backgroundColor:"#101010"},
  documentText:{fontSize:11,lineHeight:18,color:"#E2E2E2"},
  endMarker:{fontSize:10,color:"#D9A93F",fontWeight:"800",textAlign:"center",paddingVertical:12},
  acceptButton:{minHeight:48,backgroundColor:"#D9A93F",borderRadius:10,alignItems:"center",justifyContent:"center"},
  acceptText:{fontSize:14,color:"#17130B",fontWeight:"900"},
  disabled:{opacity:.4},
  error:{fontSize:11,color:"#FF9292"},
  signOut:{alignItems:"center",paddingVertical:8},
  signOutText:{fontSize:11,color:"#D9A93F",fontWeight:"800"},
  note:{fontSize:9,lineHeight:15,color:"#999",textAlign:"center"}
});
