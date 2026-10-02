import 'dart:io';

import 'package:dio/dio.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:open_filex/open_filex.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';

import '../../core/api_client.dart';
import '../../core/auth_state.dart';
import '../../core/catalog_service.dart';
import '../../core/error_message.dart';
import '../../l10n/app_strings.dart';

/// Pedido explícito del usuario: poder subir análisis/radiografías/
/// estudios (PDF/JPG/PNG) para que el médico que atiende una
/// emergencia los vea junto al resto de la Ficha de Salud, y el propio
/// viajero también pueda volver a verlos — dos entry points, mismo
/// contenido: como pestaña de "Salud" (ver health_records_screen.dart)
/// y desde el cartel al cerrar cualquiera de los tres modos del
/// asistente (ver _DocumentsPromptSheet más abajo).
class DocumentsTab extends StatefulWidget {
  const DocumentsTab({super.key});

  @override
  State<DocumentsTab> createState() => _DocumentsTabState();
}

class _DocumentsTabState extends State<DocumentsTab> {
  List<dynamic> _documents = [];
  bool _loading = true;
  String? _error;
  List<CatalogValue> _documentTypes = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final documentsResponse = await ApiClient.instance.dio.get('/me/clinical/documents');
      final documentTypes = await CatalogService.get('CLINICAL_DOCUMENT_TYPE');
      if (!mounted) return;
      setState(() {
        _documents = documentsResponse.data as List;
        _documentTypes = documentTypes;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = context.tr('documents.loadError');
        _loading = false;
      });
    }
  }

  Future<void> _pickAndUpload() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['pdf', 'jpg', 'jpeg', 'png'],
      withData: false,
    );
    final picked = result?.files.single;
    if (picked?.path == null || !mounted) return;
    await _showUploadForm(File(picked!.path!), picked.name);
  }

  Future<void> _showUploadForm(File file, String fileName) async {
    final lang = context.read<AuthState>().preferredLang;
    String? documentType;
    final titleController = TextEditingController();
    final descriptionController = TextEditingController();
    DateTime? documentDate;
    bool uploading = false;

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(left: 16, right: 16, top: 16, bottom: MediaQuery.of(ctx).viewInsets.bottom + 16),
        child: StatefulBuilder(
          builder: (ctx, setSheetState) => SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(ctx.tr('documents.uploadTitle'), style: Theme.of(ctx).textTheme.titleLarge),
                const SizedBox(height: 4),
                Text(fileName, style: const TextStyle(color: Colors.grey), overflow: TextOverflow.ellipsis),
                const SizedBox(height: 16),
                DropdownButtonFormField<String>(
                  initialValue: documentType,
                  isExpanded: true,
                  decoration: InputDecoration(labelText: ctx.tr('documents.typeLabel')),
                  items: _documentTypes
                      .map((t) => DropdownMenuItem(value: t.code, child: Text(t.label(lang), overflow: TextOverflow.ellipsis)))
                      .toList(),
                  onChanged: (v) => setSheetState(() => documentType = v),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: titleController,
                  decoration: InputDecoration(labelText: ctx.tr('documents.titleLabel')),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: descriptionController,
                  maxLines: 2,
                  decoration: InputDecoration(labelText: ctx.tr('documents.descriptionLabel')),
                ),
                const SizedBox(height: 12),
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(documentDate != null
                      ? DateFormat('dd/MM/yyyy').format(documentDate!)
                      : ctx.tr('documents.dateLabel')),
                  trailing: const Icon(Icons.calendar_today),
                  onTap: () async {
                    final picked = await showDatePicker(
                      context: ctx,
                      initialDate: documentDate ?? DateTime.now(),
                      firstDate: DateTime(1950),
                      lastDate: DateTime.now(),
                    );
                    if (picked != null) setSheetState(() => documentDate = picked);
                  },
                ),
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: uploading || documentType == null
                      ? null
                      : () async {
                          setSheetState(() => uploading = true);
                          try {
                            await ApiClient.instance.dio.post(
                              '/me/clinical/documents',
                              data: FormData.fromMap({
                                'documentType': documentType,
                                if (titleController.text.trim().isNotEmpty) 'title': titleController.text.trim(),
                                if (descriptionController.text.trim().isNotEmpty)
                                  'description': descriptionController.text.trim(),
                                if (documentDate != null)
                                  'documentDate': documentDate!.toIso8601String().split('T').first,
                                'file': await MultipartFile.fromFile(file.path, filename: fileName),
                              }),
                            );
                            if (ctx.mounted) Navigator.of(ctx).pop();
                            await _load();
                          } catch (e) {
                            setSheetState(() => uploading = false);
                            if (ctx.mounted) {
                              ScaffoldMessenger.of(ctx).showSnackBar(
                                SnackBar(content: Text(dioErrorMessage(e, ctx.tr('documents.uploadError')))),
                              );
                            }
                          }
                        },
                  child: uploading
                      ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                      : Text(ctx.tr('documents.uploadButton')),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  /// Descarga el archivo (mismo Dio con el token de sesión ya
  /// interceptado) a un directorio temporal — paso común a "ver" y
  /// "compartir", que hacen algo distinto con el mismo archivo local.
  Future<File?> _downloadToTemp(Map<String, dynamic> doc) async {
    final id = doc['id'] as String;
    final fileName = (doc['file_name_original'] as String?) ?? 'documento';
    final response = await ApiClient.instance.dio.get<List<int>>(
      '/clinical/documents/$id/file',
      options: Options(responseType: ResponseType.bytes),
    );
    final tempFile = File('${Directory.systemTemp.path}/$fileName');
    await tempFile.writeAsBytes(response.data!);
    return tempFile;
  }

  /// Pedido explícito del usuario: "ver" es distinto de "compartir" —
  /// esto abre el documento con la app asociada del propio celular
  /// (visor de PDF, galería), sin pasar por el selector de "enviar a".
  Future<void> _openDocument(Map<String, dynamic> doc) async {
    try {
      final tempFile = await _downloadToTemp(doc);
      if (tempFile == null) return;
      await OpenFilex.open(tempFile.path);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(dioErrorMessage(e, context.tr('documents.viewError')))),
      );
    }
  }

  Future<void> _shareDocument(Map<String, dynamic> doc) async {
    try {
      final tempFile = await _downloadToTemp(doc);
      if (tempFile == null) return;
      await Share.shareXFiles([XFile(tempFile.path)]);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(dioErrorMessage(e, context.tr('documents.shareError')))),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final lang = context.watch<AuthState>().preferredLang;
    return Scaffold(
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(_error!, textAlign: TextAlign.center),
                        const SizedBox(height: 12),
                        OutlinedButton(onPressed: _load, child: Text(context.tr('common.retry'))),
                      ],
                    ),
                  ),
                )
              : RefreshIndicator(
                  onRefresh: _load,
                  child: _documents.isEmpty
                      ? ListView(
                          children: [
                            Padding(
                              padding: const EdgeInsets.all(24),
                              child: Text(context.tr('documents.empty'), textAlign: TextAlign.center),
                            ),
                          ],
                        )
                      : ListView.builder(
                          itemCount: _documents.length,
                          itemBuilder: (context, i) {
                            final doc = _documents[i] as Map<String, dynamic>;
                            final typeLabel = CatalogService.labelFor(_documentTypes, doc['document_type_id'] as String?, lang: lang);
                            final title = (doc['title'] as String?)?.trim();
                            final date = doc['document_date'] as String?;
                            final dateFmt = date != null ? DateFormat('dd/MM/yyyy').format(DateTime.parse(date)) : null;
                            final isPdf = (doc['mime_type'] as String?) == 'application/pdf';
                            return ListTile(
                              leading: Icon(isPdf ? Icons.picture_as_pdf_outlined : Icons.image_outlined),
                              title: Text(title?.isNotEmpty == true ? title! : typeLabel),
                              subtitle: Text([typeLabel, ?dateFmt].join(' · ')),
                              trailing: IconButton(
                                icon: const Icon(Icons.share_outlined),
                                tooltip: context.tr('documents.shareButton'),
                                onPressed: () => _shareDocument(doc),
                              ),
                              onTap: () => _openDocument(doc),
                            );
                          },
                        ),
                ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _pickAndUpload,
        icon: const Icon(Icons.upload_file_outlined),
        label: Text(context.tr('documents.uploadButton')),
      ),
    );
  }
}

/// Pedido explícito del usuario: al terminar de cargar datos de salud
/// (en cualquiera de los tres modos), avisarle al viajero que también
/// puede subir sus estudios/análisis/radiografías, con un botón para
/// hacerlo ahí mismo — no obligatorio, un simple aviso con opción de
/// "ahora no".
Future<void> showUploadDocumentsPrompt(BuildContext context) async {
  final go = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(ctx.tr('documents.promptTitle')),
      content: Text(ctx.tr('documents.promptBody')),
      actions: [
        TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: Text(ctx.tr('documents.promptLater'))),
        FilledButton(onPressed: () => Navigator.of(ctx).pop(true), child: Text(ctx.tr('documents.promptUploadNow'))),
      ],
    ),
  );
  if (go != true || !context.mounted) return;
  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (_) => FractionallySizedBox(
      heightFactor: 0.9,
      child: Scaffold(
        appBar: AppBar(title: Text(context.tr('documents.tabTitle'))),
        body: const DocumentsTab(),
      ),
    ),
  );
}
