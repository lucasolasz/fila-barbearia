import { ArrowLeft, Loader2 } from "lucide-react";
import React, { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import {
  Bold,
  ChevronLeft,
  ChevronRight,
  Image,
  Italic,
  Megaphone,
  Send,
} from "lucide-react";
import { useShopSettings } from "../hooks/useShopSettings";

export default function AdminCampaigns() {
  const navigate = useNavigate();
  const [campaignTitle, setCampaignTitle] = useState("");
  const [messageText, setMessageText] = useState("");
  const [availableContacts] = useState([
    { id: "1", name: "Mateus Rosa", phone: "21999990001" },
    { id: "2", name: "Bruno Cavalcante", phone: "21999990002" },
    { id: "3", name: "Sidinei", phone: "21999990003" },
    { id: "4", name: "Carlos Silva", phone: "21999990004" },
    { id: "5", name: "André Santos", phone: "21999990005" },
    { id: "6", name: "Rafael Oliveira", phone: "21999990006" },
  ]);
  const [selectedContacts, setSelectedContacts] = useState<
    { id: string; name: string; phone: string }[]
  >([]);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const { webhookUrl, shopName, logoUrl } = useShopSettings();

  useEffect(() => {
    const auth = sessionStorage.getItem("barber_admin_auth");
    if (auth !== "true") {
      navigate("/admin");
      return;
    }
    setLoading(false);
  }, [navigate]);

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
    const contact = availableContacts.find((c) => c.id === contactId);
    if (contact && !selectedContacts.find((c) => c.id === contactId)) {
      setSelectedContacts([...selectedContacts, contact]);
    }
  };

  const handleMoveToAvailable = (contactId: string) => {
    setSelectedContacts(selectedContacts.filter((c) => c.id !== contactId));
  };

  const CAMPAIGN_WEBHOOK_URL = "https://n8ndes.ltech.app.br/webhook/campanha";

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

    setSending(true);
    try {
      const payload = {
        titulo_campanha: campaignTitle,
        mensagem_texto: messageText,
        destinatarios: selectedContacts.map((c) => ({
          nome: c.name,
          numero: c.phone,
        })),
      };

      await fetch(CAMPAIGN_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      toast.success(
        `Campanha enviada para ${selectedContacts.length} contatos!`,
      );
      setCampaignTitle("");
      setMessageText("");
      setSelectedContacts([]);
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
          <div className="w-[120px]" />
        </div>
      </header>

      <main className="mx-auto max-w-6xl p-4">
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
                    <div className="border border-neutral-700 rounded-xl bg-neutral-800 max-h-48 overflow-y-auto">
                      {availableContacts
                        .filter(
                          (c) => !selectedContacts.find((s) => s.id === c.id),
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
                      onClick={() =>
                        availableContacts.forEach((c) => {
                          if (!selectedContacts.find((s) => s.id === c.id)) {
                            handleMoveToSelected(c.id);
                          }
                        })
                      }
                      className="p-2 bg-neutral-800 hover:bg-emerald-600 text-neutral-400 hover:text-white rounded-xl transition-colors"
                      title="Selecionar Todos"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        selectedContacts.forEach((c) =>
                          handleMoveToAvailable(c.id),
                        )
                      }
                      className="p-2 bg-neutral-800 hover:bg-red-600 text-neutral-400 hover:text-white rounded-xl transition-colors"
                      title="Remover Todos"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                  </div>

                  <div className="flex-1">
                    <p className="text-xs text-neutral-500 mb-2 font-semibold uppercase">
                      Selecionados ({selectedContacts.length})
                    </p>
                    <div className="border border-neutral-700 rounded-xl bg-neutral-800 max-h-48 overflow-y-auto">
                      {selectedContacts.map((contact) => (
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

              <button
                onClick={handleSendCampaign}
                disabled={
                  sending ||
                  !campaignTitle.trim() ||
                  !messageText.trim() ||
                  selectedContacts.length === 0
                }
                className="w-full h-14 rounded-xl bg-emerald-600 font-bold text-white shadow-lg hover:bg-emerald-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
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
                  <div className="flex justify-end mt-2">
                    <svg className="h-4 w-4 text-[#005c4a]" viewBox="0 0 8 13">
                      <path d="M0 0L8 0L8 8L4 13L0 8Z" />
                    </svg>
                  </div>
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
      </main>
    </div>
  );
}
