import { ArrowLeft, Loader2 } from "lucide-react";
import React, { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import {
  Bold,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Image,
  Italic,
  Megaphone,
  Save,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { supabase, Campaign } from "../lib/supabase";
import { useShopSettings } from "../hooks/useShopSettings";

export default function AdminCampaigns() {
  const navigate = useNavigate();
  const [campaignTitle, setCampaignTitle] = useState("");
  const [messageText, setMessageText] = useState("");
  const [availableContacts, setAvailableContacts] = useState<
    { id: string; name: string; phone: string }[]
  >([]);
  const [selectedContacts, setSelectedContacts] = useState<
    { id: string; name: string; phone: string }[]
  >([]);
  const [searchAvailable, setSearchAvailable] = useState("");
  const [searchSelected, setSearchSelected] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Campaign[]>([]);
  const [sentCampaigns, setSentCampaigns] = useState<Campaign[]>([]);
  const [showDrafts, setShowDrafts] = useState(false);
  const [showSent, setShowSent] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [recipientStats, setRecipientStats] = useState<
    Record<string, { sent: number; error: number; invalid: number; pending: number; total: number }>
  >({});
  const { shopName, logoUrl, campaignWebhookUrl } = useShopSettings();

  async function fetchDrafts() {
    const { data, error } = await supabase
      .from("campaigns")
      .select("id, title, message, is_draft, selected_contact_ids, recipient_count, send_status, created_at, updated_at")
      .eq("is_draft", true)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("Error fetching drafts:", error);
    }
    if (data) {
      setDrafts(data.map((d: Campaign) => ({ ...d, recipient_count: d.selected_contact_ids?.length || 0 })));
    }
  }

  async function fetchRecipientStats(campaignIds: string[]) {
    if (campaignIds.length === 0) {
      setRecipientStats({});
      return;
    }
    const { data, error } = await supabase
      .from("campaign_recipients")
      .select("campaign_id, status")
      .in("campaign_id", campaignIds);
    if (error) {
      console.error("Error fetching recipient stats:", error);
      return;
    }
    const stats: Record<
      string,
      { sent: number; error: number; invalid: number; pending: number; total: number }
    > = {};
    (data || []).forEach((row: { campaign_id: string; status: string }) => {
      if (!stats[row.campaign_id]) {
        stats[row.campaign_id] = { sent: 0, error: 0, invalid: 0, pending: 0, total: 0 };
      }
      stats[row.campaign_id].total += 1;
      if (row.status === "sent") stats[row.campaign_id].sent += 1;
      else if (row.status === "error") stats[row.campaign_id].error += 1;
      else if (row.status === "invalid_number") stats[row.campaign_id].invalid += 1;
      else stats[row.campaign_id].pending += 1;
    });
    setRecipientStats(stats);
  }

  async function fetchSentCampaigns() {
    const { data, error } = await supabase
      .from("campaigns")
      .select("id, title, message, is_draft, selected_contact_ids, recipient_count, send_status, created_at, updated_at")
      .eq("is_draft", false)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("Error fetching sent campaigns:", error);
    }
    if (data) {
      setSentCampaigns(data);
      fetchRecipientStats(data.map((c) => c.id));
    }
  }

  useEffect(() => {
    const auth = sessionStorage.getItem("barber_admin_auth");
    if (auth !== "true") {
      navigate("/admin");
      return;
    }

    async function fetchCustomers() {
      const { data } = await supabase
        .from("customers")
        .select("id, name, phone")
        .order("name", { ascending: true });

      if (data) {
        const validContacts = (data as { id: string; name: string; phone: string }[])
          .filter((c) => c.phone && !c.phone.startsWith("manual_"))
          .map((c) => {
            const cleanPhone = c.phone.replace(/\D/g, "");
            const phone55 =
              cleanPhone.startsWith("55") ? cleanPhone : `55${cleanPhone}`;
            return {
              id: c.id,
              name: c.name.trim(),
              phone: phone55,
            };
          })
          .filter((c) => c.phone.length >= 12 && c.phone.length <= 13);
        setAvailableContacts(validContacts);
      }
    }

    async function loadData() {
      await fetchCustomers();
      await fetchDrafts();
      await fetchSentCampaigns();
      setLoading(false);
    }

    loadData();

    const channel = supabase
      .channel("campaign_recipients_progress")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "campaign_recipients" },
        () => {
          fetchSentCampaigns();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [navigate]);

  const handleSaveDraft = async () => {
    if (!campaignTitle.trim() || !messageText.trim()) {
      toast.error("Título e mensagem são obrigatórios para salvar");
      return;
    }

    setSavingDraft(true);
    try {
      const { error } = await supabase
        .from("campaigns")
        .insert({
          title: campaignTitle.trim(),
          message: messageText.trim(),
          is_draft: true,
          selected_contact_ids: selectedContacts.map(c => c.id),
        });

      if (error) throw error;
      toast.success("Rascunho salvo!");
      fetchDrafts();
    } catch (error) {
      toast.error("Falha ao salvar rascunho");
    } finally {
      setSavingDraft(false);
    }
  };

  const handleLoadDraft = (draft: { id: string; title: string; message: string; selected_contact_ids?: string[] }) => {
    setCampaignTitle(draft.title);
    setMessageText(draft.message);
    const restoredContacts = availableContacts.filter((c) =>
      draft.selected_contact_ids?.includes(c.id),
    );
    setSelectedContacts(restoredContacts);
    setShowDrafts(false);
    toast.success("Rascunho carregado!");
  };

  const handleDeleteDraft = async (draftId: string) => {
    try {
      await supabase.from("campaigns").delete().eq("id", draftId);
      toast.success("Rascunho excluído!");
      fetchDrafts();
    } catch (error) {
      toast.error("Falha ao excluir rascunho");
    }
  };

  const handleDeleteSentCampaign = async (campaignId: string) => {
    try {
      await supabase.from("campaigns").delete().eq("id", campaignId);
      toast.success("Campanha excluída!");
      fetchSentCampaigns();
    } catch (error) {
      toast.error("Falha ao excluir campanha");
    }
  };

  const formatPreviewMessage = (text: string) => {
    let formatted = text;
    formatted = formatted.replace(/\n/g, "<br>");
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    formatted = formatted.replace(/\*(.*?)\*/g, "<em>$1</em>");
    return formatted;
  };

  const wrapSelection = (wrapper: "bold" | "italic") => {
    const textarea = document.querySelector(
      'textarea[placeholder*="Digite sua mensagem"]',
    ) as HTMLTextAreaElement;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = messageText.substring(start, end);

    if (selectedText) {
      const before = messageText.substring(0, start);
      const after = messageText.substring(end);
      if (wrapper === "bold") {
        setMessageText(`${before}**${selectedText}**${after}`);
      } else {
        setMessageText(`${before}*${selectedText}*${after}`);
      }
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(
          start + (wrapper === "bold" ? 2 : 1),
          end + (wrapper === "bold" ? 2 : 1),
        );
      }, 0);
    } else {
      if (wrapper === "bold") {
        setMessageText(messageText + "**bold**");
      } else {
        setMessageText(messageText + "*italic*");
      }
    }
  };

  const handleMoveToSelected = (contactId: string) => {
    const contact = availableContacts.find((c: { id: string; name: string; phone: string }) => c.id === contactId);
    if (contact && !selectedContacts.find((c: { id: string; name: string; phone: string }) => c.id === contactId)) {
      setSelectedContacts([...selectedContacts, contact]);
    }
  };

  const handleMoveToAvailable = (contactId: string) => {
    setSelectedContacts(selectedContacts.filter((c: { id: string; name: string; phone: string }) => c.id !== contactId));
  };

  const handleSelectAll = () => {
    const filtered = availableContacts.filter(
      (c) =>
        !selectedContacts.find((s) => s.id === c.id) &&
        (c.name.toLowerCase().includes(searchAvailable.toLowerCase()) ||
          c.phone.includes(searchAvailable)),
    );
    setSelectedContacts([...selectedContacts, ...filtered]);
  };

  const handleDeselectAll = () => {
    if (!searchSelected) {
      setSelectedContacts([]);
      return;
    }
    setSelectedContacts(
      selectedContacts.filter(
        (c) =>
          !(
            c.name.toLowerCase().includes(searchSelected.toLowerCase()) ||
            c.phone.includes(searchSelected)
          ),
      ),
    );
  };

  const handleSendCampaign = async () => {
    if (
      !campaignTitle.trim() ||
      !messageText.trim() ||
      selectedContacts.length === 0
    ) {
      toast.error(
        "Preencha todos os campos e selecione pelo menos um destinatário",
      );
      return;
    }

    if (!campaignWebhookUrl) {
      toast.error(
        "URL do webhook de campanhas não configurada. Configure em Admin → Configurações.",
      );
      return;
    }

    setSending(true);
    try {
      const { data: campaignRow, error: campaignError } = await supabase
        .from("campaigns")
        .insert({
          title: campaignTitle.trim(),
          message: messageText.trim(),
          is_draft: false,
          recipient_count: selectedContacts.length,
          selected_contact_ids: selectedContacts.map((c) => c.id),
          send_status: "sending",
        })
        .select("id")
        .single();

      if (campaignError || !campaignRow) {
        throw campaignError || new Error("Falha ao criar campanha");
      }

      const { error: recipientsError } = await supabase
        .from("campaign_recipients")
        .insert(
          selectedContacts.map((c) => ({
            campaign_id: campaignRow.id,
            customer_id: c.id,
            nome: c.name.trim().split(" ")[0],
            numero: c.phone,
            status: "pending",
          })),
        );

      if (recipientsError) throw recipientsError;

      let finalWebhookUrl = campaignWebhookUrl.trim();
      if (
        !finalWebhookUrl.startsWith("http://") &&
        !finalWebhookUrl.startsWith("https://")
      ) {
        finalWebhookUrl = "https://" + finalWebhookUrl;
      }

      const response = await fetch(finalWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaign_id: campaignRow.id }),
      });

      if (!response.ok) {
        await supabase
          .from("campaigns")
          .update({ send_status: "failed" })
          .eq("id", campaignRow.id);
        throw new Error(`Webhook respondeu ${response.status}`);
      }

      toast.success(
        `Campanha disparada para ${selectedContacts.length} contatos! Acompanhe o progresso em "Enviadas".`,
      );
      setCampaignTitle("");
      setMessageText("");
      setSelectedContacts([]);
      fetchSentCampaigns();
    } catch (error) {
      toast.error("Falha ao enviar campanha");
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 pb-20">
      <header className="sticky top-0 z-10 border-b border-neutral-800 bg-neutral-900/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between p-4">
          <button
            onClick={() => navigate("/admin")}
            className="flex items-center text-neutral-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="mr-2 h-5 w-5" />
            Voltar ao Painel
          </button>
          <h1 className="text-xl font-bold text-white">
            Campanhas de WhatsApp
          </h1>
          <div />
        </div>
      </header>

      <main className="mx-auto max-w-6xl p-4 space-y-6">
        {/* Rascunhos */}
        <div className="rounded-2xl bg-neutral-900 border border-neutral-800">
          <button
            onClick={() => setShowDrafts(!showDrafts)}
            className="w-full flex items-center justify-between p-4 text-left"
          >
            <div className="flex items-center gap-2">
              <Save className="h-5 w-5 text-neutral-400" />
              <span className="font-bold text-white">Rascunhos</span>
              <span className="text-xs bg-neutral-700 text-neutral-300 px-2 py-0.5 rounded-full">{drafts.length}</span>
            </div>
            <ChevronRight className={`h-5 w-5 text-neutral-400 transition-transform ${showDrafts ? 'rotate-90' : ''}`} />
          </button>
          {showDrafts && (
            <div className="px-4 pb-4">
              {drafts.length === 0 ? (
                <p className="text-neutral-500 text-sm py-4 text-center">Nenhum rascunho salvo</p>
              ) : (
                <div className="max-h-64 overflow-y-auto pr-1">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pb-1">
                    {drafts.map((draft) => (
                      <div
                        key={draft.id}
                        className="bg-neutral-800 rounded-xl p-4 border border-neutral-700 hover:border-emerald-500 transition-colors"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-bold text-white truncate">{draft.title}</h3>
                            <p className="text-xs text-neutral-500 mt-1">
                              {new Date(draft.created_at).toLocaleString("pt-BR")}
                            </p>
                            <p className="text-sm text-neutral-400 mt-2 line-clamp-2">{draft.message}</p>
                            <p className="text-xs text-emerald-500 mt-2">{draft.recipient_count} contatos</p>
                          </div>
                          <div className="flex flex-col gap-1 ml-2">
                            <button
                              onClick={() => { handleLoadDraft(draft); setShowForm(true); }}
                              className="p-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors"
                              title="Carregar"
                            >
                              <ChevronRight className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteDraft(draft.id)}
                              className="p-2 bg-neutral-700 hover:bg-red-600 text-neutral-400 hover:text-white rounded-lg transition-colors"
                              title="Excluir"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Enviadas */}
        <div className="rounded-2xl bg-neutral-900 border border-neutral-800">
          <button
            onClick={() => setShowSent(!showSent)}
            className="w-full flex items-center justify-between p-4 text-left"
          >
            <div className="flex items-center gap-2">
              <Send className="h-5 w-5 text-neutral-400" />
              <span className="font-bold text-white">Enviadas</span>
              <span className="text-xs bg-neutral-700 text-neutral-300 px-2 py-0.5 rounded-full">{sentCampaigns.length}</span>
            </div>
            <ChevronRight className={`h-5 w-5 text-neutral-400 transition-transform ${showSent ? 'rotate-90' : ''}`} />
          </button>
          {showSent && (
            <div className="px-4 pb-4">
              {sentCampaigns.length === 0 ? (
                <p className="text-neutral-500 text-sm py-4 text-center">Nenhuma campanha enviada</p>
              ) : (
                <div className="max-h-64 overflow-y-auto pr-1">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pb-1">
                    {sentCampaigns.map((campaign) => (
                      <div
                        key={campaign.id}
                        className="bg-neutral-800 rounded-xl p-4 border border-neutral-700"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-bold text-white truncate">{campaign.title}</h3>
                            <p className="text-xs text-neutral-500 mt-1">
                              {new Date(campaign.created_at).toLocaleString("pt-BR")}
                            </p>
                            <p className="text-sm text-neutral-400 mt-2 line-clamp-2">{campaign.message}</p>
                            {(() => {
                              const stats = recipientStats[campaign.id];
                              const total = stats?.total || campaign.recipient_count;
                              const sent = stats?.sent || 0;
                              const errorCount = (stats?.error || 0) + (stats?.invalid || 0);
                              const statusLabel =
                                campaign.send_status === "sending"
                                  ? "Enviando..."
                                  : campaign.send_status === "failed"
                                    ? "Falhou ao iniciar"
                                    : "Concluída";
                              const statusColor =
                                campaign.send_status === "sending"
                                  ? "text-amber-400"
                                  : campaign.send_status === "failed"
                                    ? "text-red-500"
                                    : "text-emerald-500";
                              return (
                                <div className="mt-2 space-y-0.5">
                                  <p className={`text-xs font-bold ${statusColor}`}>{statusLabel}</p>
                                  <p className="text-xs text-neutral-500">
                                    {sent}/{total} enviadas
                                    {errorCount > 0 && ` · ${errorCount} com erro`}
                                  </p>
                                </div>
                              );
                            })()}
                          </div>
                          <div className="flex flex-col gap-1 ml-2">
                            <button
                              onClick={() => { handleLoadDraft({ id: campaign.id, title: campaign.title, message: campaign.message, selected_contact_ids: campaign.selected_contact_ids }); setShowForm(true); }}
                              className="p-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors"
                              title="Carregar"
                            >
                              <ChevronRight className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteSentCampaign(campaign.id)}
                              className="p-2 bg-neutral-700 hover:bg-red-600 text-neutral-400 hover:text-white rounded-lg transition-colors"
                              title="Excluir"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Botão Nova Campanha */}
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="w-full h-14 rounded-2xl bg-emerald-600 hover:bg-emerald-700 font-bold text-white transition-all flex items-center justify-center gap-2"
          >
            <Megaphone className="h-5 w-5" />
            Nova Campanha
          </button>
        )}

        {/* Formulário */}
        {showForm && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">Nova Campanha</h2>
            <button
              onClick={() => setShowForm(false)}
              className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-700 transition-colors"
            >
              <X className="h-4 w-4" />
              Cancelar
            </button>
          </div>
          <div className="flex flex-col lg:flex-row gap-6">
          <div className="flex-1 space-y-6">
            <div className="rounded-2xl bg-neutral-900 p-6 border border-neutral-800 space-y-6">
              <div>
                <label className="block text-sm font-bold text-neutral-400 mb-2">
                  Título da Campanha
                </label>
                <input
                  type="text"
                  value={campaignTitle}
                  onChange={(e) => setCampaignTitle(e.target.value)}
                  placeholder="Ex: Promoção de Janeiro"
                  className="w-full h-12 rounded-xl border border-neutral-700 bg-neutral-800 px-4 text-white outline-none focus:border-emerald-500 focus:bg-neutral-900"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-neutral-400 mb-2">
                  Mensagem
                </label>
                <div className="relative">
                  <div className="flex items-center space-x-1 mb-2 border border-neutral-700 rounded-lg p-1 bg-neutral-800">
                    <button
                      type="button"
                      onClick={() => wrapSelection("bold")}
                      className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-700 rounded transition-colors"
                      title="Negrito"
                    >
                      <Bold className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => wrapSelection("italic")}
                      className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-700 rounded transition-colors"
                      title="Itálico"
                    >
                      <Italic className="h-4 w-4" />
                    </button>
                  </div>
                  <textarea
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    placeholder="Digite sua mensagem aqui... Use **texto** para negrito e *texto* para itálico"
                    rows={6}
                    className="w-full rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-3 text-white outline-none focus:border-emerald-500 focus:bg-neutral-900 resize-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-neutral-400 mb-2">
                  Upload de Imagem
                </label>
                <button
                  disabled
                  className="w-full h-24 rounded-xl border-2 border-dashed border-neutral-700 bg-neutral-800/50 text-neutral-500 flex items-center justify-center cursor-not-allowed opacity-50"
                >
                  <div className="flex items-center space-x-2">
                    <Image className="h-5 w-5" />
                    <span>Em breve</span>
                  </div>
                </button>
              </div>

              <div>
                <label className="block text-sm font-bold text-neutral-400 mb-2">
                  Seleção de Destinatários
                </label>
                <div className="flex items-center space-x-4">
                  <div className="flex-1">
                    <p className="text-xs text-neutral-500 mb-2 font-semibold uppercase">
                      Contatos Disponíveis
                    </p>
                    <div className="relative mb-2">
                      <input
                        type="text"
                        value={searchAvailable}
                        onChange={(e) => setSearchAvailable(e.target.value)}
                        placeholder="Pesquisar..."
                        className="w-full h-10 rounded-lg border border-neutral-700 bg-neutral-800 pl-3 pr-8 text-sm text-white outline-none focus:border-emerald-500"
                      />
                      {searchAvailable && (
                        <button
                          type="button"
                          onClick={() => setSearchAvailable("")}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    <div className="border border-neutral-700 rounded-xl bg-neutral-800 h-64 overflow-y-auto">
                      {availableContacts
                        .filter(
                          (c: { id: string; name: string; phone: string }) =>
                            !selectedContacts.find((s) => s.id === c.id) &&
                            (c.name
                              .toLowerCase()
                              .includes(searchAvailable.toLowerCase()) ||
                              c.phone.includes(searchAvailable))
                        )
                        .map((contact) => (
                          <div
                            key={contact.id}
                            className="flex items-center justify-between px-4 py-3 hover:bg-neutral-700 cursor-pointer border-b border-neutral-700 last:border-b-0"
                            onClick={() => handleMoveToSelected(contact.id)}
                          >
                            <div>
                              <p className="text-white font-medium">
                                {contact.name}
                              </p>
                              <p className="text-xs text-neutral-500">
                                {contact.phone}
                              </p>
                            </div>
                            <ChevronRight className="h-5 w-5 text-emerald-500" />
                          </div>
                        ))}
                      {availableContacts.filter(
                        (c) => !selectedContacts.find((s) => s.id === c.id),
                      ).length === 0 && (
                        <div className="px-4 py-6 text-center text-neutral-500">
                          Nenhum contato disponível
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col space-y-2">
                    <button
                      type="button"
                      onClick={handleSelectAll}
                      className="flex items-center justify-center px-3 py-2 bg-neutral-800 hover:bg-emerald-600 text-neutral-400 hover:text-white rounded-xl transition-colors"
                      title="Selecionar Todos"
                    >
                      <ChevronsRight className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      onClick={handleDeselectAll}
                      className="flex items-center justify-center px-3 py-2 bg-neutral-800 hover:bg-red-600 text-neutral-400 hover:text-white rounded-xl transition-colors"
                      title="Remover Todos"
                    >
                      <ChevronsLeft className="h-5 w-5" />
                    </button>
                  </div>

                  <div className="flex-1">
                    <p className="text-xs text-neutral-500 mb-2 font-semibold uppercase">
                      Selecionados ({selectedContacts.length})
                    </p>
                    <div className="relative mb-2">
                      <input
                        type="text"
                        value={searchSelected}
                        onChange={(e) => setSearchSelected(e.target.value)}
                        placeholder="Pesquisar..."
                        className="w-full h-10 rounded-lg border border-neutral-700 bg-neutral-800 pl-3 pr-8 text-sm text-white outline-none focus:border-emerald-500"
                      />
                      {searchSelected && (
                        <button
                          type="button"
                          onClick={() => setSearchSelected("")}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    <div className="border border-neutral-700 rounded-xl bg-neutral-800 h-64 overflow-y-auto">
                      {selectedContacts
                        .filter(
                          (c: { id: string; name: string; phone: string }) =>
                            c.name
                              .toLowerCase()
                              .includes(searchSelected.toLowerCase()) ||
                            c.phone.includes(searchSelected)
                        )
                        .map((contact) => (
                        <div
                          key={contact.id}
                          className="flex items-center justify-between px-4 py-3 hover:bg-neutral-700 cursor-pointer border-b border-neutral-700 last:border-b-0"
                          onClick={() => handleMoveToAvailable(contact.id)}
                        >
                          <ChevronLeft className="h-5 w-5 text-red-500" />
                          <div className="flex-1">
                            <p className="text-white font-medium">
                              {contact.name}
                            </p>
                            <p className="text-xs text-neutral-500">
                              {contact.phone}
                            </p>
                          </div>
                        </div>
                      ))}
                      {selectedContacts.length === 0 && (
                        <div className="px-4 py-6 text-center text-neutral-500">
                          Nenhum contato selecionado
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleSaveDraft}
                  disabled={savingDraft || !campaignTitle.trim() || !messageText.trim()}
                  className="flex-1 h-14 rounded-xl bg-neutral-700 font-bold text-white shadow-lg hover:bg-neutral-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                >
                  {savingDraft ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      <Save className="h-5 w-5" />
                      <span>Salvar Rascunho</span>
                    </>
                  )}
                </button>
                <button
                  onClick={handleSendCampaign}
                  disabled={
                    sending ||
                    !campaignTitle.trim() ||
                    !messageText.trim() ||
                    selectedContacts.length === 0
                  }
                  className="flex-1 h-14 rounded-xl bg-emerald-600 font-bold text-white shadow-lg hover:bg-emerald-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                >
                  {sending ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      <Send className="h-5 w-5" />
                      <span>Enviar Campanha</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          <div className="lg:w-96 space-y-4">
            <p className="text-sm font-bold text-neutral-400 uppercase">
              Pré-visualização
            </p>
            <div className="bg-[#1f2c34] rounded-3xl p-6 flex flex-col min-h-[500px]">
              <div className="flex items-center space-x-3 pb-4 border-b border-[#37474f]">
                <div className="w-12 h-12 rounded-full bg-emerald-600 flex items-center justify-center overflow-hidden">
                  {campaignTitle ? (
                    <span className="text-white font-bold text-lg">
                      {campaignTitle.charAt(0).toUpperCase()}
                    </span>
                  ) : (
                    <Megaphone className="h-6 w-6 text-white" />
                  )}
                </div>
                <div>
                  <p className="text-white font-bold">
                    {campaignTitle || "Título da Campanha"}
                  </p>
                  <p className="text-[#8796a1] text-sm">{shopName}</p>
                </div>
              </div>

              <div className="flex-1 flex items-center justify-center py-8">
                <div className="max-w-xs w-full">
                  <div className="bg-[#005c4a] rounded-2xl rounded-tr-md p-4 text-white">
                    <div
                      className="text-sm leading-relaxed"
                      dangerouslySetInnerHTML={{
                        __html:
                          formatPreviewMessage(messageText) ||
                          "<span class='text-[#8696a0]'>Sua mensagem aparecerá aqui...</span>",
                      }}
                    />
                  </div>
                  <div className="flex justify-end mt-2"></div>
                  <p className="text-[#8696a0] text-xs text-right mt-1">
                    {new Date().toLocaleTimeString("pt-BR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            </div>
          </div>
          </div>
        </div>
        )}
      </main>
    </div>
  );
}
