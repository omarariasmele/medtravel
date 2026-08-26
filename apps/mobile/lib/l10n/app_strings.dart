import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/auth_state.dart';

/// Pedido explícito del usuario: "la app debería estar en el idioma
/// que seleccionó el usuario, así como todos los mensajes que
/// recibe" — traducción de la interfaz FIJA de la app (botones, menús,
/// textos de cada pantalla). Distinto del asistente de IA, que ya
/// arma sus propias respuestas en el idioma preferido llamando al
/// backend (ver openai.provider.ts) — esto es la mitad que faltaba.
///
/// Mismo patrón que ya usa el backend (AIService.t(), ver
/// ai.service.ts) para no reinventar un enfoque nuevo: un mapa clave
/// -> {es,en,pt,fr}, sin librería de i18n con generación de código
/// (flutter_localizations + .arb) — menos piezas nuevas que puedan
/// romperse justo antes de la demo, y consistente con el resto del
/// proyecto.
///
/// Cobertura: esto se completa PANTALLA POR PANTALLA dado el tamaño
/// real del trabajo (cada pantalla tiene su propio texto fijo) — no
/// está completo de una sola vez. Lo que todavía no tiene clave acá
/// sigue en español hasta que se convierta.
class AppStrings {
  AppStrings._();

  static const Map<String, Map<String, String>> _t = {
    // ── Acciones genéricas, compartidas entre pantallas ──
    'common.retry': {'es': 'Reintentar', 'en': 'Retry', 'pt': 'Tentar novamente', 'fr': 'Réessayer'},
    'common.cancel': {'es': 'Cancelar', 'en': 'Cancel', 'pt': 'Cancelar', 'fr': 'Annuler'},
    'common.save': {'es': 'Guardar', 'en': 'Save', 'pt': 'Salvar', 'fr': 'Enregistrer'},
    'common.edit': {'es': 'Editar', 'en': 'Edit', 'pt': 'Editar', 'fr': 'Modifier'},
    'common.delete': {'es': 'Borrar', 'en': 'Delete', 'pt': 'Excluir', 'fr': 'Supprimer'},
    'common.add': {'es': 'Agregar', 'en': 'Add', 'pt': 'Adicionar', 'fr': 'Ajouter'},

    // ── Navegación inferior (home_shell.dart) ──
    'nav.home': {'es': 'Inicio', 'en': 'Home', 'pt': 'Início', 'fr': 'Accueil'},
    'nav.health': {'es': 'Salud', 'en': 'Health', 'pt': 'Saúde', 'fr': 'Santé'},
    'nav.coverage': {'es': 'Cobertura', 'en': 'Coverage', 'pt': 'Cobertura', 'fr': 'Couverture'},
    'nav.trips': {'es': 'Viajes', 'en': 'Trips', 'pt': 'Viagens', 'fr': 'Voyages'},
    'nav.emergency': {'es': 'Emergencia', 'en': 'Emergency', 'pt': 'Emergência', 'fr': 'Urgence'},

    // ── login_screen.dart ──
    'login.email': {'es': 'Email', 'en': 'Email', 'pt': 'Email', 'fr': 'Email'},
    'login.password': {'es': 'Contraseña', 'en': 'Password', 'pt': 'Senha', 'fr': 'Mot de passe'},
    'login.submit': {'es': 'Ingresar', 'en': 'Log in', 'pt': 'Entrar', 'fr': 'Se connecter'},
    'login.noAccount': {
      'es': '¿No tenés cuenta? Registrate',
      'en': "Don't have an account? Sign up",
      'pt': 'Não tem conta? Cadastre-se',
      'fr': "Vous n'avez pas de compte ? Inscrivez-vous",
    },
    'login.forgotPassword': {
      'es': '¿Olvidaste tu contraseña?',
      'en': 'Forgot your password?',
      'pt': 'Esqueceu sua senha?',
      'fr': 'Mot de passe oublié ?',
    },
    'login.error': {
      'es': 'Email o contraseña incorrectos.',
      'en': 'Incorrect email or password.',
      'pt': 'Email ou senha incorretos.',
      'fr': 'Email ou mot de passe incorrect.',
    },

    // ── home_screen.dart ──
    'home.viewEditProfile': {
      'es': 'Ver / editar mi perfil',
      'en': 'View / edit my profile',
      'pt': 'Ver / editar meu perfil',
      'fr': 'Voir / modifier mon profil',
    },
    'home.quickActions': {
      'es': 'Accesos rápidos',
      'en': 'Quick actions',
      'pt': 'Acessos rápidos',
      'fr': 'Accès rapides',
    },
    'home.shareTitle': {
      'es': 'Compartir mi Historial de Salud',
      'en': 'Share my Health Record',
      'pt': 'Compartilhar meu Histórico de Saúde',
      'fr': 'Partager mon dossier de santé',
    },
    'home.shareSubtitle': {
      'es': 'QR o link para el médico que te atienda',
      'en': 'QR code or link for the doctor treating you',
      'pt': 'QR ou link para o médico que te atender',
      'fr': 'QR code ou lien pour le médecin qui vous soigne',
    },
    'home.assistantHelpTitle': {
      'es': 'Asistente para usar la app',
      'en': 'Assistant for using the app',
      'pt': 'Assistente para usar o aplicativo',
      'fr': "Assistant pour utiliser l'application",
    },
    'home.assistantHelpSubtitle': {
      'es': 'Ayuda para completar tus datos de salud',
      'en': 'Help completing your health information',
      'pt': 'Ajuda para preencher seus dados de saúde',
      'fr': 'Aide pour compléter vos informations de santé',
    },
    'home.updateHealthTitle': {
      'es': 'Actualizar información de la Ficha de Salud',
      'en': 'Update your Health Record information',
      'pt': 'Atualizar informações da Ficha de Saúde',
      'fr': 'Mettre à jour votre dossier de santé',
    },
    'home.updateHealthSubtitle': {
      'es': 'Contale tus alergias/medicamentos y los carga por vos',
      'en': 'Tell it your allergies/medications and it loads them for you',
      'pt': 'Conte suas alergias/medicamentos e ele carrega por você',
      'fr': 'Racontez vos allergies/médicaments et il les enregistre pour vous',
    },
    'home.noHealthDataTitle': {
      'es': 'Todavía no cargaste tu información de salud',
      'en': "You haven't loaded your health information yet",
      'pt': 'Você ainda não carregou suas informações de saúde',
      'fr': "Vous n'avez pas encore renseigné vos informations de santé",
    },
    'home.noHealthDataBody': {
      'es': 'Por favor ingresá tus antecedentes de salud, como enfermedades crónicas, alergias, medicamentos '
          'u otra información de relevancia, para que en caso de emergencia puedas compartir tus datos de salud '
          'con el médico que te asista. Tocá este mensaje para cargarla ahora, solo te llevará unos minutos.',
      'en': 'Please enter your health information — chronic conditions, allergies, medications, or any other '
          'relevant information — so that in an emergency you can share your health data with the doctor treating '
          'you. Tap this message to load it now, it will only take a few minutes.',
      'pt': 'Por favor, insira seus antecedentes de saúde, como doenças crônicas, alergias, medicamentos ou '
          'outras informações relevantes, para que em caso de emergência você possa compartilhar seus dados de '
          'saúde com o médico que te atender. Toque nesta mensagem para carregá-los agora, vai levar só alguns minutos.',
      'fr': "Veuillez renseigner vos antécédents de santé — maladies chroniques, allergies, médicaments ou toute "
          "autre information pertinente — afin de pouvoir partager vos données de santé avec le médecin qui vous "
          "prendra en charge en cas d'urgence. Appuyez sur ce message pour les renseigner maintenant, cela prendra "
          'seulement quelques minutes.',
    },
    'home.incompleteProfileTitle': {
      'es': 'Completá tu perfil',
      'en': 'Complete your profile',
      'pt': 'Complete seu perfil',
      'fr': 'Complétez votre profil',
    },
    'home.incompleteProfileBody': {
      'es': 'Todavía te falta cargar {missing}. Tocá para completarlo.',
      'en': "You still need to add {missing}. Tap to complete it.",
      'pt': 'Ainda falta carregar {missing}. Toque para completar.',
      'fr': 'Il vous manque encore {missing}. Appuyez pour le compléter.',
    },
    'home.missingBirthDate': {
      'es': 'tu fecha de nacimiento',
      'en': 'your date of birth',
      'pt': 'sua data de nascimento',
      'fr': 'votre date de naissance',
    },
    'home.missingPhone': {
      'es': 'tu número de celular',
      'en': 'your phone number',
      'pt': 'seu número de celular',
      'fr': 'votre numéro de téléphone',
    },
    'home.missingEmergencyContact': {
      'es': 'al menos un contacto de emergencia',
      'en': 'at least one emergency contact',
      'pt': 'pelo menos um contato de emergência',
      'fr': "au moins un contact d'urgence",
    },
    'home.and': {'es': 'y', 'en': 'and', 'pt': 'e', 'fr': 'et'},
    'home.logout': {'es': 'Cerrar sesión', 'en': 'Log out', 'pt': 'Sair', 'fr': 'Se déconnecter'},
    'home.traveler': {'es': 'Viajero', 'en': 'Traveler', 'pt': 'Viajante', 'fr': 'Voyageur'},
    'home.welcomeTitle': {
      'es': '¡Bienvenido/a a MedTravelApp!',
      'en': 'Welcome to MedTravelApp!',
      'pt': 'Bem-vindo(a) ao MedTravelApp!',
      'fr': 'Bienvenue sur MedTravelApp !',
    },
    'home.understood': {'es': 'Entendido', 'en': 'Got it', 'pt': 'Entendi', 'fr': 'Compris'},

    // ── profile_screen.dart ──
    'profile.title': {'es': 'Mi perfil', 'en': 'My profile', 'pt': 'Meu perfil', 'fr': 'Mon profil'},
    'profile.retry': {'es': 'Reintentar', 'en': 'Retry', 'pt': 'Tentar novamente', 'fr': 'Réessayer'},
    'profile.loadError': {
      'es': 'No se pudo cargar el perfil. Revisá tu conexión e intentá de nuevo.',
      'en': "Couldn't load your profile. Check your connection and try again.",
      'pt': 'Não foi possível carregar o perfil. Verifique sua conexão e tente novamente.',
      'fr': "Impossible de charger le profil. Vérifiez votre connexion et réessayez.",
    },
    'profile.takePhoto': {'es': 'Sacar foto', 'en': 'Take photo', 'pt': 'Tirar foto', 'fr': 'Prendre une photo'},
    'profile.chooseFromGallery': {
      'es': 'Elegir de la galería',
      'en': 'Choose from gallery',
      'pt': 'Escolher da galeria',
      'fr': 'Choisir dans la galerie',
    },
    'profile.adjustPhoto': {'es': 'Ajustar foto', 'en': 'Adjust photo', 'pt': 'Ajustar foto', 'fr': 'Ajuster la photo'},
    'profile.photoUpdated': {
      'es': 'Foto de perfil actualizada.',
      'en': 'Profile photo updated.',
      'pt': 'Foto de perfil atualizada.',
      'fr': 'Photo de profil mise à jour.',
    },
    'profile.photoUploadError': {
      'es': 'No se pudo subir la foto.',
      'en': "Couldn't upload the photo.",
      'pt': 'Não foi possível enviar a foto.',
      'fr': "Impossible d'envoyer la photo.",
    },
    'profile.photoPermissionError': {
      'es': 'No se pudo acceder a la cámara/galería — revisá los permisos de la app en Ajustes del celular.',
      'en': "Couldn't access the camera/gallery — check the app's permissions in your phone Settings.",
      'pt': 'Não foi possível acessar a câmera/galeria — verifique as permissões do app nas Configurações do celular.',
      'fr': "Impossible d'accéder à la caméra/galerie — vérifiez les autorisations de l'app dans les Réglages du téléphone.",
    },
    'profile.confirmEmailTitle': {
      'es': 'Confirmar email',
      'en': 'Confirm email',
      'pt': 'Confirmar email',
      'fr': "Confirmer l'email",
    },
    'profile.confirmEmailBody': {
      'es': '¿Tu email es "{email}"? Te vamos a mandar un código a esa dirección para verificarlo.',
      'en': 'Is your email "{email}"? We\'ll send a code to that address to verify it.',
      'pt': 'Seu email é "{email}"? Vamos enviar um código para esse endereço para verificá-lo.',
      'fr': 'Votre email est-il "{email}" ? Nous allons envoyer un code à cette adresse pour le vérifier.',
    },
    'profile.reviewAgain': {
      'es': 'Revisar de nuevo',
      'en': 'Review again',
      'pt': 'Revisar novamente',
      'fr': 'Vérifier à nouveau',
    },
    'profile.yesConfirm': {'es': 'Sí, confirmar', 'en': 'Yes, confirm', 'pt': 'Sim, confirmar', 'fr': 'Oui, confirmer'},
    'profile.updated': {
      'es': 'Perfil actualizado.',
      'en': 'Profile updated.',
      'pt': 'Perfil atualizado.',
      'fr': 'Profil mis à jour.',
    },
    'profile.updatedWithEmailCode': {
      'es': 'Perfil actualizado. Te mandamos un código nuevo a {email} para verificarlo.',
      'en': 'Profile updated. We sent a new code to {email} to verify it.',
      'pt': 'Perfil atualizado. Enviamos um novo código para {email} para verificá-lo.',
      'fr': 'Profil mis à jour. Nous avons envoyé un nouveau code à {email} pour le vérifier.',
    },
    'profile.saveError': {
      'es': 'No se pudo guardar el perfil.',
      'en': "Couldn't save the profile.",
      'pt': 'Não foi possível salvar o perfil.',
      'fr': "Impossible d'enregistrer le profil.",
    },
    'profile.documentSaved': {
      'es': 'Documento guardado.',
      'en': 'Document saved.',
      'pt': 'Documento salvo.',
      'fr': 'Document enregistré.',
    },
    'profile.documentSavedWithMatches': {
      'es': 'Documento guardado — se encontró {count} póliza(s) esperándote.',
      'en': 'Document saved — found {count} polic(y/ies) waiting for you.',
      'pt': 'Documento salvo — encontramos {count} apólice(s) esperando por você.',
      'fr': 'Document enregistré — {count} police(s) vous attend(ent).',
    },
    'profile.documentSaveError': {
      'es': 'No se pudo guardar el documento (¿ya lo habías cargado?).',
      'en': "Couldn't save the document (had you already added it?).",
      'pt': 'Não foi possível salvar o documento (você já o tinha cadastrado?).',
      'fr': "Impossible d'enregistrer le document (l'aviez-vous déjà ajouté ?).",
    },
    'profile.addEmergencyContactTitle': {
      'es': 'Agregar contacto de emergencia',
      'en': 'Add emergency contact',
      'pt': 'Adicionar contato de emergência',
      'fr': "Ajouter un contact d'urgence",
    },
    'profile.firstName': {'es': 'Nombre', 'en': 'First name', 'pt': 'Nome', 'fr': 'Prénom'},
    'profile.lastName': {'es': 'Apellido', 'en': 'Last name', 'pt': 'Sobrenome', 'fr': 'Nom'},
    'profile.phone': {'es': 'Teléfono', 'en': 'Phone', 'pt': 'Telefone', 'fr': 'Téléphone'},
    'profile.relationship': {'es': 'Parentesco', 'en': 'Relationship', 'pt': 'Parentesco', 'fr': 'Lien de parenté'},
    'profile.cancel': {'es': 'Cancelar', 'en': 'Cancel', 'pt': 'Cancelar', 'fr': 'Annuler'},
    'profile.fillAllFields': {
      'es': 'Completá todos los campos.',
      'en': 'Fill in all fields.',
      'pt': 'Preencha todos os campos.',
      'fr': 'Remplissez tous les champs.',
    },
    'profile.requiredField': {
      'es': 'Este campo es obligatorio',
      'en': 'This field is required',
      'pt': 'Este campo é obrigatório',
      'fr': 'Ce champ est obligatoire',
    },
    'profile.save': {'es': 'Guardar', 'en': 'Save', 'pt': 'Salvar', 'fr': 'Enregistrer'},
    'profile.contactSaveError': {
      'es': 'No se pudo guardar el contacto.',
      'en': "Couldn't save the contact.",
      'pt': 'Não foi possível salvar o contato.',
      'fr': "Impossible d'enregistrer le contact.",
    },
    'profile.contactDeleteError': {
      'es': 'No se pudo eliminar el contacto.',
      'en': "Couldn't delete the contact.",
      'pt': 'Não foi possível excluir o contato.',
      'fr': "Impossible de supprimer le contact.",
    },
    'profile.personalData': {
      'es': 'Datos personales',
      'en': 'Personal information',
      'pt': 'Dados pessoais',
      'fr': 'Informations personnelles',
    },
    'profile.email': {'es': 'Email', 'en': 'Email', 'pt': 'Email', 'fr': 'Email'},
    'profile.verified': {'es': 'Verificado', 'en': 'Verified', 'pt': 'Verificado', 'fr': 'Vérifié'},
    'profile.notVerifiedEmail': {
      'es': 'No verificado — revisá tu casilla o guardá de nuevo si está mal escrito',
      'en': 'Not verified — check your inbox, or save again if it was mistyped',
      'pt': 'Não verificado — verifique sua caixa de entrada, ou salve novamente se estiver com erro',
      'fr': "Non vérifié — consultez votre boîte mail, ou enregistrez à nouveau en cas d'erreur",
    },
    'profile.notVerifiedPhone': {
      'es': 'No verificado',
      'en': 'Not verified',
      'pt': 'Não verificado',
      'fr': 'Non vérifié',
    },
    'profile.birthDatePrefix': {
      'es': 'Nacimiento: {date}',
      'en': 'Date of birth: {date}',
      'pt': 'Nascimento: {date}',
      'fr': 'Naissance : {date}',
    },
    'profile.birthDateLabel': {
      'es': 'Fecha de nacimiento',
      'en': 'Date of birth',
      'pt': 'Data de nascimento',
      'fr': 'Date de naissance',
    },
    'profile.gender': {'es': 'Sexo', 'en': 'Sex', 'pt': 'Sexo', 'fr': 'Sexe'},
    'profile.bloodType': {'es': 'Grupo sanguíneo', 'en': 'Blood type', 'pt': 'Tipo sanguíneo', 'fr': 'Groupe sanguin'},
    'profile.currentPrefix': {'es': 'Actual: {value}', 'en': 'Current: {value}', 'pt': 'Atual: {value}', 'fr': 'Actuel : {value}'},
    'profile.assistantLanguage': {
      'es': 'Idioma del asistente / Assistant language',
      'en': 'Assistant language',
      'pt': 'Idioma do assistente',
      'fr': "Langue de l'assistant",
    },
    'profile.saveProfile': {
      'es': 'Guardar perfil',
      'en': 'Save profile',
      'pt': 'Salvar perfil',
      'fr': 'Enregistrer le profil',
    },
    'profile.identityDocument': {
      'es': 'Documento de identidad',
      'en': 'Identity document',
      'pt': 'Documento de identidade',
      'fr': "Pièce d'identité",
    },
    'profile.documentHelper': {
      'es': 'Cargarlo permite que el sistema te asocie automáticamente a tu póliza de asistencia si la empresa ya la cargó.',
      'en': 'Adding it lets the system automatically link you to your assistance policy, if your company already loaded it.',
      'pt': 'Cadastrá-lo permite que o sistema te associe automaticamente à sua apólice de assistência, se a empresa já a cadastrou.',
      'fr': "L'ajouter permet au système de vous associer automatiquement à votre police d'assistance, si votre entreprise l'a déjà chargée.",
    },
    'profile.documentType': {
      'es': 'Tipo de documento',
      'en': 'Document type',
      'pt': 'Tipo de documento',
      'fr': 'Type de document',
    },
    'profile.documentNumber': {
      'es': 'N° de documento',
      'en': 'Document number',
      'pt': 'Número do documento',
      'fr': 'Numéro de document',
    },
    'profile.issuingCountry': {
      'es': 'País emisor (opcional)',
      'en': 'Issuing country (optional)',
      'pt': 'País emissor (opcional)',
      'fr': 'Pays émetteur (facultatif)',
    },
    'profile.saveDocument': {
      'es': 'Guardar documento',
      'en': 'Save document',
      'pt': 'Salvar documento',
      'fr': 'Enregistrer le document',
    },
    'profile.emergencyContacts': {
      'es': 'Contactos de emergencia',
      'en': 'Emergency contacts',
      'pt': 'Contatos de emergência',
      'fr': "Contacts d'urgence",
    },
    'profile.emergencyContactsHelper': {
      'es': 'Hasta 3 personas que el médico puede ver si compartís tu ficha por QR/link.',
      'en': 'Up to 3 people the doctor can see if you share your record via QR/link.',
      'pt': 'Até 3 pessoas que o médico pode ver se você compartilhar sua ficha por QR/link.',
      'fr': "Jusqu'à 3 personnes que le médecin peut voir si vous partagez votre dossier par QR/lien.",
    },
    'profile.addContact': {
      'es': 'Agregar contacto',
      'en': 'Add contact',
      'pt': 'Adicionar contato',
      'fr': 'Ajouter un contact',
    },

    // ── health_records_screen.dart — pedido explícito del usuario:
    // primero lo VISIBLE en todas las pantallas (título, tabs,
    // botones principales, banners); los campos de cada uno de los 7
    // formularios (agregar/editar alergia, condición, etc.) quedan
    // para una segunda pasada.
    'health.title': {
      'es': 'Historial de Salud',
      'en': 'Health Record',
      'pt': 'Histórico de Saúde',
      'fr': 'Dossier de santé',
    },
    'health.tabAllergies': {'es': 'Alergias', 'en': 'Allergies', 'pt': 'Alergias', 'fr': 'Allergies'},
    'health.tabConditions': {'es': 'Enfermedades', 'en': 'Conditions', 'pt': 'Doenças', 'fr': 'Maladies'},
    'health.tabImplants': {'es': 'Implantes', 'en': 'Implants', 'pt': 'Implantes', 'fr': 'Implants'},
    'health.tabTreatments': {'es': 'Tratamientos', 'en': 'Treatments', 'pt': 'Tratamentos', 'fr': 'Traitements'},
    'health.tabMedications': {'es': 'Medicamentos', 'en': 'Medications', 'pt': 'Medicamentos', 'fr': 'Médicaments'},
    'health.tabSurgeries': {'es': 'Cirugías', 'en': 'Surgeries', 'pt': 'Cirurgias', 'fr': 'Chirurgies'},
    'health.tabVitals': {
      'es': 'Peso y Mediciones',
      'en': 'Weight & Measurements',
      'pt': 'Peso e Medidas',
      'fr': 'Poids et mesures',
    },
    'health.tabLabResults': {'es': 'Estudios', 'en': 'Lab results', 'pt': 'Exames', 'fr': 'Analyses'},
    'health.noDataYet': {
      'es': 'No hay información de salud registrada todavía. Ingresá tus datos por si los necesitás ante una emergencia.',
      'en': "There's no health information saved yet. Add your information in case you need it in an emergency.",
      'pt': 'Ainda não há informações de saúde registradas. Insira seus dados para o caso de precisar deles numa emergência.',
      'fr': "Aucune information de santé n'est encore enregistrée. Renseignez vos informations au cas où vous en auriez besoin en cas d'urgence.",
    },
    'health.lastUpdatedReminder': {
      'es': 'Última actualización: {date}. ¿Tenés alguna novedad de salud? Actualizala.',
      'en': 'Last updated: {date}. Any health updates? Add them.',
      'pt': 'Última atualização: {date}. Alguma novidade de saúde? Atualize.',
      'fr': 'Dernière mise à jour : {date}. Du nouveau côté santé ? Mettez à jour.',
    },
    'health.lastUpdated': {
      'es': 'Última actualización: {date}',
      'en': 'Last updated: {date}',
      'pt': 'Última atualização: {date}',
      'fr': 'Dernière mise à jour : {date}',
    },
    'health.updateButton': {'es': 'Actualizar', 'en': 'Update', 'pt': 'Atualizar', 'fr': 'Mettre à jour'},
    'health.enterDataButton': {
      'es': 'Ingresar datos',
      'en': 'Enter information',
      'pt': 'Inserir dados',
      'fr': 'Renseigner les informations',
    },
    'health.deleteThisData': {
      'es': '¿Borrar este dato?',
      'en': 'Delete this entry?',
      'pt': 'Excluir este dado?',
      'fr': 'Supprimer cette entrée ?',
    },
    'health.deleteConfirmBody': {
      'es': 'Vas a borrar "{item}". Si lo cargaste por error, esta acción lo saca de tu Historial de Salud.',
      'en': 'You\'re about to delete "{item}". If you added it by mistake, this removes it from your Health Record.',
      'pt': 'Você vai excluir "{item}". Se foi carregado por engano, esta ação o remove do seu Histórico de Saúde.',
      'fr': 'Vous allez supprimer "{item}". Si vous l\'avez ajouté par erreur, cette action le retire de votre dossier de santé.',
    },
    'health.deleteError': {
      'es': 'No se pudo borrar. Probá de nuevo.',
      'en': "Couldn't delete. Try again.",
      'pt': 'Não foi possível excluir. Tente novamente.',
      'fr': 'Impossible de supprimer. Réessayez.',
    },
    // ── Alergias ──
    'health.allergy.editTitle': {'es': 'Editar alergia', 'en': 'Edit allergy', 'pt': 'Editar alergia', 'fr': "Modifier l'allergie"},
    'health.allergy.addTitle': {'es': 'Agregar alergia', 'en': 'Add allergy', 'pt': 'Adicionar alergia', 'fr': 'Ajouter une allergie'},
    'health.allergy.allergenLabel': {'es': 'Alérgeno', 'en': 'Allergen', 'pt': 'Alérgeno', 'fr': 'Allergène'},
    'health.allergy.typeLabel': {'es': 'Tipo', 'en': 'Type', 'pt': 'Tipo', 'fr': 'Type'},
    'health.allergy.severityLabel': {'es': 'Severidad', 'en': 'Severity', 'pt': 'Gravidade', 'fr': 'Sévérité'},
    'health.allergy.notesOptional': {'es': 'Notas (opcional)', 'en': 'Notes (optional)', 'pt': 'Notas (opcional)', 'fr': 'Notes (facultatif)'},
    'health.allergy.enterAllergenError': {
      'es': 'Ingresá el alérgeno.',
      'en': 'Enter the allergen.',
      'pt': 'Digite o alérgeno.',
      'fr': "Saisissez l'allergène.",
    },
    'health.allergy.emptyList': {
      'es': 'Sin alergias registradas.',
      'en': 'No allergies recorded.',
      'pt': 'Nenhuma alergia registrada.',
      'fr': 'Aucune allergie enregistrée.',
    },
    'health.allergy.loadError': {
      'es': 'No se pudieron cargar las alergias.',
      'en': "Couldn't load the allergies.",
      'pt': 'Não foi possível carregar as alergias.',
      'fr': "Impossible de charger les allergies.",
    },
    'health.allergy.registeredOn': {
      'es': 'Registrada {date}',
      'en': 'Recorded {date}',
      'pt': 'Registrada {date}',
      'fr': 'Enregistrée {date}',
    },
    'health.allergy.deletedFallback': {
      'es': 'esta alergia',
      'en': 'this allergy',
      'pt': 'esta alergia',
      'fr': 'cette allergie',
    },
    // ── Enfermedades / condiciones ──
    'health.condition.editTitle': {'es': 'Editar condición', 'en': 'Edit condition', 'pt': 'Editar condição', 'fr': 'Modifier la condition'},
    'health.condition.addTitle': {'es': 'Agregar condición', 'en': 'Add condition', 'pt': 'Adicionar condição', 'fr': 'Ajouter une condition'},
    'health.condition.nameLabel': {'es': 'Condición', 'en': 'Condition', 'pt': 'Condição', 'fr': 'Condition'},
    'health.condition.nameHelper': {
      'es': 'Ej. Diabetes tipo 2',
      'en': 'E.g. Type 2 diabetes',
      'pt': 'Ex. Diabetes tipo 2',
      'fr': 'Ex. Diabète de type 2',
    },
    'health.condition.statusLabel': {'es': 'Estado', 'en': 'Status', 'pt': 'Estado', 'fr': 'État'},
    'health.condition.diagnosedDateWithValue': {
      'es': 'Fecha de diagnóstico: {date}',
      'en': 'Diagnosis date: {date}',
      'pt': 'Data do diagnóstico: {date}',
      'fr': 'Date de diagnostic : {date}',
    },
    'health.condition.diagnosedDateEmpty': {
      'es': 'Fecha de diagnóstico (opcional, aproximada si no la recordás)',
      'en': "Diagnosis date (optional, approximate if you don't remember)",
      'pt': 'Data do diagnóstico (opcional, aproximada se não lembrar)',
      'fr': "Date de diagnostic (facultatif, approximative si vous ne vous en souvenez pas)",
    },
    'health.condition.enterConditionError': {
      'es': 'Ingresá la condición.',
      'en': 'Enter the condition.',
      'pt': 'Digite a condição.',
      'fr': 'Saisissez la condition.',
    },
    'health.condition.emptyList': {
      'es': 'Sin condiciones registradas.',
      'en': 'No conditions recorded.',
      'pt': 'Nenhuma condição registrada.',
      'fr': 'Aucune condition enregistrée.',
    },
    'health.condition.loadError': {
      'es': 'No se pudieron cargar los antecedentes.',
      'en': "Couldn't load the medical history.",
      'pt': 'Não foi possível carregar os antecedentes.',
      'fr': "Impossible de charger les antécédents.",
    },
    'health.condition.chronicSectionTitle': {
      'es': 'Enfermedades Crónicas',
      'en': 'Chronic Conditions',
      'pt': 'Doenças Crônicas',
      'fr': 'Maladies chroniques',
    },
    'health.condition.otherSectionTitle': {'es': 'Enfermedades', 'en': 'Conditions', 'pt': 'Doenças', 'fr': 'Maladies'},
    'health.condition.diagnosedOn': {
      'es': 'Diagnosticada {date}',
      'en': 'Diagnosed {date}',
      'pt': 'Diagnosticada {date}',
      'fr': 'Diagnostiquée {date}',
    },
    'health.condition.deletedFallback': {
      'es': 'esta condición',
      'en': 'this condition',
      'pt': 'esta condição',
      'fr': 'cette condition',
    },
    // ── Medicamentos ──
    'health.medication.editTitle': {'es': 'Editar medicamento', 'en': 'Edit medication', 'pt': 'Editar medicamento', 'fr': 'Modifier le médicament'},
    'health.medication.addTitle': {'es': 'Agregar medicamento', 'en': 'Add medication', 'pt': 'Adicionar medicamento', 'fr': 'Ajouter un médicament'},
    'health.medication.genericNameLabel': {
      'es': 'Droga (nombre genérico)',
      'en': 'Drug (generic name)',
      'pt': 'Substância (nome genérico)',
      'fr': 'Molécule (nom générique)',
    },
    'health.medication.doseOptional': {'es': 'Dosis (opcional)', 'en': 'Dose (optional)', 'pt': 'Dose (opcional)', 'fr': 'Dose (facultatif)'},
    'health.medication.unitLabel': {'es': 'Unidad', 'en': 'Unit', 'pt': 'Unidade', 'fr': 'Unité'},
    'health.medication.brandOptional': {
      'es': 'Nombre comercial (opcional)',
      'en': 'Brand name (optional)',
      'pt': 'Nome comercial (opcional)',
      'fr': 'Nom commercial (facultatif)',
    },
    'health.medication.manufacturerOptional': {
      'es': 'Laboratorio (opcional)',
      'en': 'Manufacturer (optional)',
      'pt': 'Fabricante (opcional)',
      'fr': 'Fabricant (facultatif)',
    },
    'health.medication.prescribedDateOptional': {
      'es': 'Fecha de prescripción (opcional)',
      'en': 'Prescription date (optional)',
      'pt': 'Data da prescrição (opcional)',
      'fr': 'Date de prescription (facultatif)',
    },
    'health.medication.enterDrugError': {
      'es': 'Ingresá la droga.',
      'en': 'Enter the drug.',
      'pt': 'Digite a substância.',
      'fr': 'Saisissez la molécule.',
    },
    'health.medication.emptyList': {
      'es': 'Sin medicamentos registrados.',
      'en': 'No medications recorded.',
      'pt': 'Nenhum medicamento registrado.',
      'fr': 'Aucun médicament enregistré.',
    },
    'health.medication.loadError': {
      'es': 'No se pudieron cargar los medicamentos.',
      'en': "Couldn't load the medications.",
      'pt': 'Não foi possível carregar os medicamentos.',
      'fr': "Impossible de charger les médicaments.",
    },
    'health.medication.currentBadge': {'es': 'Actual', 'en': 'Current', 'pt': 'Atual', 'fr': 'Actuel'},
    'health.medication.discontinuedBadge': {
      'es': 'Discontinuado',
      'en': 'Discontinued',
      'pt': 'Descontinuado',
      'fr': 'Interrompu',
    },
    'health.medication.sinceDate': {'es': 'Desde {date}', 'en': 'Since {date}', 'pt': 'Desde {date}', 'fr': 'Depuis {date}'},
    'health.medication.deletedFallback': {
      'es': 'este medicamento',
      'en': 'this medication',
      'pt': 'este medicamento',
      'fr': 'ce médicament',
    },
    // ── Cirugías ──
    'health.surgery.editTitle': {'es': 'Editar cirugía', 'en': 'Edit surgery', 'pt': 'Editar cirurgia', 'fr': 'Modifier la chirurgie'},
    'health.surgery.addTitle': {'es': 'Agregar cirugía', 'en': 'Add surgery', 'pt': 'Adicionar cirurgia', 'fr': 'Ajouter une chirurgie'},
    'health.surgery.nameLabel': {
      'es': 'Cirugía / procedimiento',
      'en': 'Surgery / procedure',
      'pt': 'Cirurgia / procedimento',
      'fr': 'Chirurgie / intervention',
    },
    'health.surgery.nameHelper': {
      'es': 'Ej. Apendicectomía',
      'en': 'E.g. Appendectomy',
      'pt': 'Ex. Apendicectomia',
      'fr': 'Ex. Appendicectomie',
    },
    'health.surgery.dateWithValue': {'es': 'Fecha: {date}', 'en': 'Date: {date}', 'pt': 'Data: {date}', 'fr': 'Date : {date}'},
    'health.surgery.dateEmpty': {
      'es': 'Fecha (aproximada si no la recordás)',
      'en': "Date (approximate if you don't remember)",
      'pt': 'Data (aproximada se não lembrar)',
      'fr': "Date (approximative si vous ne vous en souvenez pas)",
    },
    'health.surgery.enterSurgeryError': {
      'es': 'Ingresá la cirugía.',
      'en': 'Enter the surgery.',
      'pt': 'Digite a cirurgia.',
      'fr': 'Saisissez la chirurgie.',
    },
    'health.surgery.emptyList': {
      'es': 'Sin cirugías registradas.',
      'en': 'No surgeries recorded.',
      'pt': 'Nenhuma cirurgia registrada.',
      'fr': 'Aucune chirurgie enregistrée.',
    },
    'health.surgery.loadError': {
      'es': 'No se pudieron cargar las cirugías.',
      'en': "Couldn't load the surgeries.",
      'pt': 'Não foi possível carregar as cirurgias.',
      'fr': "Impossible de charger les chirurgies.",
    },
    'health.surgery.badgeLabel': {'es': 'Cirugía', 'en': 'Surgery', 'pt': 'Cirurgia', 'fr': 'Chirurgie'},
    'health.surgery.deletedFallback': {'es': 'esta cirugía', 'en': 'this surgery', 'pt': 'esta cirurgia', 'fr': 'cette chirurgie'},
    // ── Peso y mediciones (vitals) ──
    'health.vitals.newMeasurementTitle': {
      'es': 'Nueva medición',
      'en': 'New measurement',
      'pt': 'Nova medição',
      'fr': 'Nouvelle mesure',
    },
    'health.vitals.hint': {
      'es': 'Peso, altura y presión pueden cambiar — cada registro queda con su propia fecha, no reemplaza al anterior.',
      'en': "Weight, height and blood pressure can change — each record keeps its own date, it doesn't replace the previous one.",
      'pt': 'Peso, altura e pressão podem mudar — cada registro fica com sua própria data, não substitui o anterior.',
      'fr': "Le poids, la taille et la tension peuvent changer — chaque enregistrement garde sa propre date, il ne remplace pas le précédent.",
    },
    'health.vitals.weightLabel': {'es': 'Peso (kg)', 'en': 'Weight (kg)', 'pt': 'Peso (kg)', 'fr': 'Poids (kg)'},
    'health.vitals.heightLabel': {'es': 'Altura (cm)', 'en': 'Height (cm)', 'pt': 'Altura (cm)', 'fr': 'Taille (cm)'},
    'health.vitals.systolicLabel': {
      'es': 'Presión — sistólica',
      'en': 'Blood pressure — systolic',
      'pt': 'Pressão — sistólica',
      'fr': 'Tension — systolique',
    },
    'health.vitals.diastolicLabel': {
      'es': 'Presión — diastólica',
      'en': 'Blood pressure — diastolic',
      'pt': 'Pressão — diastólica',
      'fr': 'Tension — diastolique',
    },
    'health.vitals.bloodTypeLabel': {'es': 'Grupo sanguíneo', 'en': 'Blood type', 'pt': 'Tipo sanguíneo', 'fr': 'Groupe sanguin'},
    'health.vitals.bloodTypeFixedWithValue': {
      'es': 'Grupo sanguíneo: {value}',
      'en': 'Blood type: {value}',
      'pt': 'Tipo sanguíneo: {value}',
      'fr': 'Groupe sanguin : {value}',
    },
    'health.vitals.bloodTypeFixedEmpty': {
      'es': 'Grupo sanguíneo: no cargado',
      'en': 'Blood type: not set',
      'pt': 'Tipo sanguíneo: não informado',
      'fr': 'Groupe sanguin : non renseigné',
    },
    'health.vitals.bloodTypeEditLink': {
      'es': 'Editar', 'en': 'Edit', 'pt': 'Editar', 'fr': 'Modifier',
    },
    'health.vitals.measurementDate': {
      'es': 'Fecha de la medición: {date}',
      'en': 'Measurement date: {date}',
      'pt': 'Data da medição: {date}',
      'fr': 'Date de la mesure : {date}',
    },
    'health.vitals.emptyList': {
      'es': 'Sin peso/altura/grupo sanguíneo registrados.',
      'en': 'No weight/height/blood type recorded.',
      'pt': 'Nenhum peso/altura/tipo sanguíneo registrado.',
      'fr': 'Aucun poids/taille/groupe sanguin enregistré.',
    },
    'health.vitals.loadError': {
      'es': 'No se pudo cargar el historial de peso/altura.',
      'en': "Couldn't load the weight/height history.",
      'pt': 'Não foi possível carregar o histórico de peso/altura.',
      'fr': "Impossible de charger l'historique de poids/taille.",
    },
    'health.vitals.weightTitle': {'es': 'Peso: {value} kg', 'en': 'Weight: {value} kg', 'pt': 'Peso: {value} kg', 'fr': 'Poids : {value} kg'},
    'health.vitals.measurementTitle': {'es': 'Medición', 'en': 'Measurement', 'pt': 'Medição', 'fr': 'Mesure'},
    'health.vitals.heightWithValue': {
      'es': 'Altura: {value} cm',
      'en': 'Height: {value} cm',
      'pt': 'Altura: {value} cm',
      'fr': 'Taille : {value} cm',
    },
    'health.vitals.heightCarriedSuffix': {
      'es': ' (última cargada)',
      'en': ' (last recorded)',
      'pt': ' (última registrada)',
      'fr': ' (dernière enregistrée)',
    },
    'health.vitals.bmiWithValue': {'es': 'IMC: {value}', 'en': 'BMI: {value}', 'pt': 'IMC: {value}', 'fr': 'IMC : {value}'},
    'health.vitals.pressureWithValue': {
      'es': 'Presión: {value}',
      'en': 'Blood pressure: {value}',
      'pt': 'Pressão: {value}',
      'fr': 'Tension : {value}',
    },
    'health.vitals.bloodTypeLoaded': {
      'es': 'Grupo sanguíneo cargado',
      'en': 'Blood type recorded',
      'pt': 'Tipo sanguíneo registrado',
      'fr': 'Groupe sanguin enregistré',
    },
    // ── Estudios / análisis (lab results) ──
    'health.labResult.newStudyTitle': {'es': 'Nuevo estudio', 'en': 'New test', 'pt': 'Novo exame', 'fr': 'Nouvelle analyse'},
    'health.labResult.hint': {
      'es': 'Análisis de sangre, orina u otro estudio — cada uno queda con su propia fecha.',
      'en': "Blood tests, urine tests, or other studies — each one keeps its own date.",
      'pt': 'Exame de sangue, urina ou outro estudo — cada um fica com sua própria data.',
      'fr': "Analyse de sang, d'urine ou autre — chacune garde sa propre date.",
    },
    'health.labResult.studyTypeLabel': {'es': 'Tipo de estudio', 'en': 'Test type', 'pt': 'Tipo de exame', 'fr': "Type d'analyse"},
    'health.labResult.studyNameLabel': {
      'es': 'Estudio (ej. análisis de sangre)',
      'en': 'Test (e.g. blood test)',
      'pt': 'Exame (ex. exame de sangue)',
      'fr': "Analyse (ex. analyse de sang)",
    },
    'health.labResult.studyDate': {
      'es': 'Fecha del estudio: {date}',
      'en': 'Test date: {date}',
      'pt': 'Data do exame: {date}',
      'fr': "Date de l'analyse : {date}",
    },
    'health.labResult.glucoseLabel': {'es': 'Glucemia', 'en': 'Glucose', 'pt': 'Glicemia', 'fr': 'Glycémie'},
    'health.labResult.hba1cLabel': {'es': 'HbA1c', 'en': 'HbA1c', 'pt': 'HbA1c', 'fr': 'HbA1c'},
    'health.labResult.cholesterolLabel': {
      'es': 'Colesterol total',
      'en': 'Total cholesterol',
      'pt': 'Colesterol total',
      'fr': 'Cholestérol total',
    },
    'health.labResult.creatinineLabel': {'es': 'Creatinina', 'en': 'Creatinine', 'pt': 'Creatinina', 'fr': 'Créatinine'},
    'health.labResult.hemoglobinLabel': {'es': 'Hemoglobina', 'en': 'Hemoglobin', 'pt': 'Hemoglobina', 'fr': 'Hémoglobine'},
    'health.labResult.plateletsLabel': {'es': 'Plaquetas', 'en': 'Platelets', 'pt': 'Plaquetas', 'fr': 'Plaquettes'},
    'health.labResult.inrLabel': {'es': 'INR', 'en': 'INR', 'pt': 'INR', 'fr': 'INR'},
    'health.labResult.apttLabel': {'es': 'APTT', 'en': 'APTT', 'pt': 'APTT', 'fr': 'TCA'},
    'health.labResult.otherIndicatorsTitle': {
      'es': 'Otros indicadores',
      'en': 'Other indicators',
      'pt': 'Outros indicadores',
      'fr': 'Autres indicateurs',
    },
    'health.labResult.notesLabel': {
      'es': 'Otros valores / notas',
      'en': 'Other values / notes',
      'pt': 'Outros valores / notas',
      'fr': 'Autres valeurs / notes',
    },
    'health.labResult.saveError': {
      'es': 'No se pudo guardar el estudio — probá de nuevo.',
      'en': "Couldn't save the test — try again.",
      'pt': 'Não foi possível salvar o exame — tente novamente.',
      'fr': "Impossible d'enregistrer l'analyse — réessayez.",
    },
    'health.labResult.emptyList': {
      'es': 'Sin estudios registrados.',
      'en': 'No tests recorded.',
      'pt': 'Nenhum exame registrado.',
      'fr': 'Aucune analyse enregistrée.',
    },
    'health.labResult.loadError': {
      'es': 'No se pudo cargar el historial de estudios.',
      'en': "Couldn't load the test history.",
      'pt': 'Não foi possível carregar o histórico de exames.',
      'fr': "Impossible de charger l'historique des analyses.",
    },
    'health.labResult.defaultStudyLabel': {'es': 'Estudio', 'en': 'Test', 'pt': 'Exame', 'fr': 'Analyse'},
    'health.labResult.viewOlderStudies': {
      'es': 'Ver estudios anteriores ({n})',
      'en': 'View earlier tests ({n})',
      'pt': 'Ver exames anteriores ({n})',
      'fr': 'Voir les analyses précédentes ({n})',
    },
    'health.labResult.otherStudiesGroupLabel': {'es': 'Estudios', 'en': 'Tests', 'pt': 'Exames', 'fr': 'Analyses'},
    // ── Implantes / dispositivos ──
    'health.implant.editTitle': {
      'es': 'Editar implante o dispositivo',
      'en': 'Edit implant or device',
      'pt': 'Editar implante ou dispositivo',
      'fr': "Modifier l'implant ou l'appareil",
    },
    'health.implant.addTitle': {
      'es': 'Agregar implante o dispositivo',
      'en': 'Add implant or device',
      'pt': 'Adicionar implante ou dispositivo',
      'fr': "Ajouter un implant ou un appareil",
    },
    'health.implant.hint': {
      'es': 'Ej. marcapasos, prótesis, bomba de insulina.',
      'en': 'E.g. pacemaker, prosthesis, insulin pump.',
      'pt': 'Ex. marca-passo, prótese, bomba de insulina.',
      'fr': "Ex. pacemaker, prothèse, pompe à insuline.",
    },
    'health.implant.nameLabel': {
      'es': 'Implante / dispositivo',
      'en': 'Implant / device',
      'pt': 'Implante / dispositivo',
      'fr': 'Implant / appareil',
    },
    'health.implant.dateWithValue': {'es': 'Fecha: {date}', 'en': 'Date: {date}', 'pt': 'Data: {date}', 'fr': 'Date : {date}'},
    'health.implant.dateEmptyOptional': {
      'es': 'Fecha (opcional, aproximada si no la recordás)',
      'en': "Date (optional, approximate if you don't remember)",
      'pt': 'Data (opcional, aproximada se não lembrar)',
      'fr': "Date (facultatif, approximative si vous ne vous en souvenez pas)",
    },
    'health.implant.enterDeviceError': {
      'es': 'Ingresá el implante/dispositivo.',
      'en': 'Enter the implant/device.',
      'pt': 'Digite o implante/dispositivo.',
      'fr': "Saisissez l'implant/l'appareil.",
    },
    'health.implant.emptyList': {
      'es': 'Sin implantes ni dispositivos registrados.',
      'en': 'No implants or devices recorded.',
      'pt': 'Nenhum implante ou dispositivo registrado.',
      'fr': 'Aucun implant ni appareil enregistré.',
    },
    'health.implant.loadError': {
      'es': 'No se pudieron cargar los implantes/dispositivos.',
      'en': "Couldn't load the implants/devices.",
      'pt': 'Não foi possível carregar os implantes/dispositivos.',
      'fr': "Impossible de charger les implants/appareils.",
    },
    'health.implant.deletedFallback': {
      'es': 'este implante',
      'en': 'this implant',
      'pt': 'este implante',
      'fr': 'cet implant',
    },
    // ── Tratamientos (diálisis, quimioterapia, etc.) ──
    'health.treatment.editTitle': {
      'es': 'Editar tratamiento',
      'en': 'Edit treatment',
      'pt': 'Editar tratamento',
      'fr': 'Modifier le traitement',
    },
    'health.treatment.addTitle': {
      'es': 'Agregar tratamiento',
      'en': 'Add treatment',
      'pt': 'Adicionar tratamento',
      'fr': 'Ajouter un traitement',
    },
    'health.treatment.hint': {
      'es': 'Ej. diálisis, quimioterapia, radioterapia.',
      'en': 'E.g. dialysis, chemotherapy, radiotherapy.',
      'pt': 'Ex. diálise, quimioterapia, radioterapia.',
      'fr': 'Ex. dialyse, chimiothérapie, radiothérapie.',
    },
    'health.treatment.nameLabel': {
      'es': 'Tratamiento',
      'en': 'Treatment',
      'pt': 'Tratamento',
      'fr': 'Traitement',
    },
    'health.treatment.dateWithValue': {'es': 'Desde: {date}', 'en': 'Since: {date}', 'pt': 'Desde: {date}', 'fr': 'Depuis : {date}'},
    'health.treatment.dateEmptyOptional': {
      'es': 'Fecha de inicio (opcional, aproximada si no la recordás)',
      'en': "Start date (optional, approximate if you don't remember)",
      'pt': 'Data de início (opcional, aproximada se não lembrar)',
      'fr': "Date de début (facultatif, approximative si vous ne vous en souvenez pas)",
    },
    'health.treatment.enterTreatmentError': {
      'es': 'Ingresá el tratamiento.',
      'en': 'Enter the treatment.',
      'pt': 'Digite o tratamento.',
      'fr': 'Saisissez le traitement.',
    },
    'health.treatment.emptyList': {
      'es': 'Sin tratamientos registrados.',
      'en': 'No treatments recorded.',
      'pt': 'Nenhum tratamento registrado.',
      'fr': 'Aucun traitement enregistré.',
    },
    'health.treatment.loadError': {
      'es': 'No se pudieron cargar los tratamientos.',
      'en': "Couldn't load the treatments.",
      'pt': 'Não foi possível carregar os tratamentos.',
      'fr': 'Impossible de charger les traitements.',
    },
    'health.treatment.deletedFallback': {
      'es': 'este tratamiento',
      'en': 'this treatment',
      'pt': 'este tratamento',
      'fr': 'ce traitement',
    },
    'coverage.title': {'es': 'Mi cobertura', 'en': 'My coverage', 'pt': 'Minha cobertura', 'fr': 'Ma couverture'},
    'coverage.healthCoverageSectionTitle': {
      'es': 'Obra social / Prepaga',
      'en': 'Health insurance',
      'pt': 'Plano de saúde',
      'fr': 'Assurance santé',
    },
    'coverage.noHealthCoverage': {
      'es': 'Todavía no cargaste tu obra social o prepaga — independiente de tu asistencia al viajero.',
      'en': "You haven't added your health insurance yet — separate from your travel assistance coverage.",
      'pt': 'Você ainda não inseriu seu plano de saúde — independente da sua assistência ao viajante.',
      'fr': "Vous n'avez pas encore ajouté votre assurance santé — indépendante de votre assistance voyage.",
    },
    'coverage.pendingReview': {'es': 'En revisión', 'en': 'Under review', 'pt': 'Em análise', 'fr': 'En cours de vérification'},
    'coverage.primary': {'es': 'Principal', 'en': 'Primary', 'pt': 'Principal', 'fr': 'Principale'},
    'coverage.addHealthCoverage': {
      'es': 'Agregar obra social / prepaga',
      'en': 'Add health insurance',
      'pt': 'Adicionar plano de saúde',
      'fr': "Ajouter une assurance santé",
    },
    'coverage.travelAssistanceSectionTitle': {
      'es': 'Asistencia al viajero',
      'en': 'Travel assistance',
      'pt': 'Assistência ao viajante',
      'fr': 'Assistance voyage',
    },
    'coverage.noEnrollment': {
      'es': 'Todavía no tenés una cobertura confirmada. Si ya cargaste tu documento en Perfil y la empresa ya subió tu póliza, va a aparecer acá automáticamente.',
      'en': "You don't have a confirmed coverage yet. If you already uploaded your document in Profile and the company has uploaded your policy, it will appear here automatically.",
      'pt': 'Você ainda não tem uma cobertura confirmada. Se você já enviou seu documento no Perfil e a empresa já enviou sua apólice, ela vai aparecer aqui automaticamente.',
      'fr': "Vous n'avez pas encore de couverture confirmée. Si vous avez déjà téléversé votre document dans Profil et que la compagnie a téléversé votre police, elle apparaîtra ici automatiquement.",
    },
    'coverage.defaultPlanName': {
      'es': 'Plan de asistencia',
      'en': 'Assistance plan',
      'pt': 'Plano de assistência',
      'fr': "Plan d'assistance",
    },
    'coverage.unvalidated': {'es': 'Sin validar', 'en': 'Not verified', 'pt': 'Não validado', 'fr': 'Non vérifié'},
    'coverage.pendingApprovalSectionTitle': {
      'es': 'Pendientes de aprobación',
      'en': 'Pending approval',
      'pt': 'Pendentes de aprovação',
      'fr': "En attente d'approbation",
    },
    'coverage.declarePolicy': {
      'es': 'Declarar una póliza que no aparece',
      'en': "Declare a policy that isn't listed",
      'pt': 'Declarar uma apólice que não aparece',
      'fr': "Déclarer une police qui n'apparaît pas",
    },
    'coverage.memberNumberSuffix': {
      'es': ' · N° {value}',
      'en': ' · No. {value}',
      'pt': ' · N° {value}',
      'fr': ' · N° {value}',
    },
    'coverage.validFromInline': {'es': 'Desde {date}', 'en': 'From {date}', 'pt': 'De {date}', 'fr': 'Du {date}'},
    'coverage.validUntilInline': {'es': ' hasta {date}', 'en': ' until {date}', 'pt': ' até {date}', 'fr': " jusqu'au {date}"},
    'coverage.validUntilActiveInline': {'es': ' — vigente', 'en': ' — current', 'pt': ' — vigente', 'fr': ' — en cours'},
    'coverage.policyWithNumber': {'es': 'Póliza {number}', 'en': 'Policy {number}', 'pt': 'Apólice {number}', 'fr': 'Police {number}'},
    'coverage.validityRange': {
      'es': 'Vigencia: {from} — {until}',
      'en': 'Valid: {from} — {until}',
      'pt': 'Vigência: {from} — {until}',
      'fr': 'Validité : {from} — {until}',
    },
    'coverage.waitingCompanyConfirmation': {
      'es': 'Esperando confirmación de la empresa',
      'en': 'Waiting for company confirmation',
      'pt': 'Aguardando confirmação da empresa',
      'fr': "En attente de confirmation de la compagnie",
    },
    'coverage.declareFormTitle': {
      'es': 'Declarar mi póliza',
      'en': 'Declare my policy',
      'pt': 'Declarar minha apólice',
      'fr': 'Déclarer ma police',
    },
    'coverage.declareFormHint': {
      'es': 'Usá esto si tenés una póliza de asistencia al viajero que todavía no aparece acá — queda pendiente hasta que la empresa la confirme.',
      'en': "Use this if you have a travel assistance policy that isn't listed here yet — it stays pending until the company confirms it.",
      'pt': 'Use isto se você tem uma apólice de assistência ao viajante que ainda não aparece aqui — fica pendente até a empresa confirmar.',
      'fr': "Utilisez ceci si vous avez une police d'assistance voyage qui n'apparaît pas encore ici — elle reste en attente jusqu'à confirmation par la compagnie.",
    },
    'coverage.assistanceCompanyLabel': {
      'es': 'Empresa de asistencia',
      'en': 'Assistance company',
      'pt': 'Empresa de assistência',
      'fr': "Compagnie d'assistance",
    },
    'coverage.policyNumberLabel': {'es': 'N° de póliza', 'en': 'Policy number', 'pt': 'Número da apólice', 'fr': 'Numéro de police'},
    'coverage.declareButton': {'es': 'Declarar', 'en': 'Declare', 'pt': 'Declarar', 'fr': 'Déclarer'},
    'coverage.addFormTitle': {
      'es': 'Agregar obra social / prepaga',
      'en': 'Add health insurance',
      'pt': 'Adicionar plano de saúde',
      'fr': 'Ajouter une assurance santé',
    },
    'coverage.editFormTitle': {'es': 'Editar', 'en': 'Edit', 'pt': 'Editar', 'fr': 'Modifier'},
    'coverage.typeLabel': {'es': 'Tipo', 'en': 'Type', 'pt': 'Tipo', 'fr': 'Type'},
    'coverage.providerLabel': {'es': 'Prestador', 'en': 'Provider', 'pt': 'Prestador', 'fr': 'Prestataire'},
    'coverage.notInListLoadNew': {
      'es': 'No está en la lista — cargar nuevo',
      'en': "Not on the list — add a new one",
      'pt': 'Não está na lista — cadastrar novo',
      'fr': "Absent de la liste — en ajouter un nouveau",
    },
    'coverage.providerNameLabel': {
      'es': 'Nombre del prestador',
      'en': 'Provider name',
      'pt': 'Nome do prestador',
      'fr': 'Nom du prestataire',
    },
    'coverage.chooseFromListInstead': {
      'es': 'Elegir de la lista en vez de cargar uno nuevo',
      'en': 'Choose from the list instead of adding a new one',
      'pt': 'Escolher da lista em vez de cadastrar um novo',
      'fr': "Choisir dans la liste plutôt que d'en ajouter un nouveau",
    },
    'coverage.planLabel': {'es': 'Plan', 'en': 'Plan', 'pt': 'Plano', 'fr': 'Formule'},
    'coverage.planNameLabel': {'es': 'Nombre del plan', 'en': 'Plan name', 'pt': 'Nome do plano', 'fr': 'Nom de la formule'},
    'coverage.memberNumberLabel': {
      'es': 'N° de afiliado',
      'en': 'Member number',
      'pt': 'Número de associado',
      'fr': "Numéro d'adhérent",
    },
    'coverage.validFrom': {'es': 'Desde: {date}', 'en': 'From: {date}', 'pt': 'De: {date}', 'fr': 'Du : {date}'},
    'coverage.validUntilActive': {
      'es': 'Hasta: vigente',
      'en': 'Until: current',
      'pt': 'Até: vigente',
      'fr': "Jusqu'au : en cours",
    },
    'coverage.validUntil': {'es': 'Hasta: {date}', 'en': 'Until: {date}', 'pt': 'Até: {date}', 'fr': "Jusqu'au : {date}"},
    'coverage.notesLabel': {'es': 'Notas', 'en': 'Notes', 'pt': 'Notas', 'fr': 'Notes'},
    'coverage.isPrimaryLabel': {
      'es': 'Es mi cobertura principal',
      'en': 'This is my primary coverage',
      'pt': 'É a minha cobertura principal',
      'fr': 'Il s\'agit de ma couverture principale',
    },
    'coverage.saveFormError': {
      'es': 'No se pudo guardar — revisá los datos.',
      'en': "Couldn't save — check the information.",
      'pt': 'Não foi possível salvar — revise os dados.',
      'fr': "Impossible d'enregistrer — vérifiez les informations.",
    },
    'coverage.saveButton': {'es': 'Guardar', 'en': 'Save', 'pt': 'Salvar', 'fr': 'Enregistrer'},
    'coverage.saveChangesButton': {
      'es': 'Guardar cambios',
      'en': 'Save changes',
      'pt': 'Salvar alterações',
      'fr': 'Enregistrer les modifications',
    },
    'trips.title': {'es': 'Mis viajes', 'en': 'My trips', 'pt': 'Minhas viagens', 'fr': 'Mes voyages'},
    'trips.loadError': {
      'es': 'No se pudieron cargar los viajes.',
      'en': "Couldn't load your trips.",
      'pt': 'Não foi possível carregar as viagens.',
      'fr': "Impossible de charger les voyages.",
    },
    'trips.filterPlanned': {'es': 'Planificados', 'en': 'Upcoming', 'pt': 'Planejadas', 'fr': 'Prévus'},
    'trips.filterDone': {'es': 'Cumplidos', 'en': 'Past', 'pt': 'Concluídas', 'fr': 'Terminés'},
    'trips.filterAll': {'es': 'Todos', 'en': 'All', 'pt': 'Todas', 'fr': 'Tous'},
    'trips.emptyPlanned': {
      'es': 'No tenés viajes planificados.',
      'en': "You don't have any upcoming trips.",
      'pt': 'Você não tem viagens planejadas.',
      'fr': "Vous n'avez aucun voyage prévu.",
    },
    'trips.emptyDone': {
      'es': 'No tenés viajes cumplidos todavía.',
      'en': "You don't have any past trips yet.",
      'pt': 'Você ainda não tem viagens concluídas.',
      'fr': "Vous n'avez encore aucun voyage terminé.",
    },
    'trips.emptyAll': {
      'es': 'Todavía no cargaste ningún viaje.',
      'en': "You haven't added any trips yet.",
      'pt': 'Você ainda não adicionou nenhuma viagem.',
      'fr': "Vous n'avez encore ajouté aucun voyage.",
    },
    'trips.defaultName': {'es': 'Viaje', 'en': 'Trip', 'pt': 'Viagem', 'fr': 'Voyage'},
    'trips.autoDetectedLocation': {
      'es': 'Ubicación detectada al reportar una emergencia',
      'en': 'Location detected when reporting an emergency',
      'pt': 'Localização detectada ao reportar uma emergência',
      'fr': "Emplacement détecté lors du signalement d'une urgence",
    },
    'trips.destinationInfoTooltip': {'es': 'Info del destino', 'en': 'Destination info', 'pt': 'Info do destino', 'fr': 'Infos sur la destination'},
    'trips.editTripTooltip': {'es': 'Editar viaje', 'en': 'Edit trip', 'pt': 'Editar viagem', 'fr': 'Modifier le voyage'},
    'trips.destinationInfoError': {
      'es': 'No se pudo obtener la información de este destino.',
      'en': "Couldn't get information for this destination.",
      'pt': 'Não foi possível obter informações deste destino.',
      'fr': "Impossible d'obtenir les informations de cette destination.",
    },
    'trips.close': {'es': 'Cerrar', 'en': 'Close', 'pt': 'Fechar', 'fr': 'Fermer'},
    'trips.mute': {'es': 'Silenciar', 'en': 'Mute', 'pt': 'Silenciar', 'fr': 'Couper le son'},
    'trips.enableVoice': {'es': 'Activar voz', 'en': 'Enable voice', 'pt': 'Ativar voz', 'fr': 'Activer la voix'},
    'trips.noInfoYet': {
      'es': 'Todavía no hay información cargada para este destino.',
      'en': 'There is no information for this destination yet.',
      'pt': 'Ainda não há informações cadastradas para este destino.',
      'fr': "Il n'y a pas encore d'informations pour cette destination.",
    },
    'trips.noInfoYetFor': {
      'es': '{place}: todavía no hay información cargada.',
      'en': '{place}: there is no information yet.',
      'pt': '{place}: ainda não há informações cadastradas.',
      'fr': "{place} : il n'y a pas encore d'informations.",
    },
    'trips.vaccinations': {'es': 'Vacunas', 'en': 'Vaccinations', 'pt': 'Vacinas', 'fr': 'Vaccins'},
    'trips.healthRisks': {'es': 'Riesgos de salud', 'en': 'Health risks', 'pt': 'Riscos de saúde', 'fr': 'Risques sanitaires'},
    'trips.securityAlerts': {'es': 'Alertas de seguridad', 'en': 'Security alerts', 'pt': 'Alertas de segurança', 'fr': 'Alertes de sécurité'},
    'trips.tips': {'es': 'Tips', 'en': 'Tips', 'pt': 'Dicas', 'fr': 'Conseils'},
    'trips.disclaimer': {
      'es': 'Información general — no reemplaza fuentes oficiales (consulado, ministerio de salud). Confirmá antes de viajar.',
      'en': 'General information — does not replace official sources (consulate, ministry of health). Confirm before traveling.',
      'pt': 'Informação geral — não substitui fontes oficiais (consulado, ministério da saúde). Confirme antes de viajar.',
      'fr': "Information générale — ne remplace pas les sources officielles (consulat, ministère de la santé). Vérifiez avant de voyager.",
    },
    'emergency.title': {'es': 'Emergencia', 'en': 'Emergency', 'pt': 'Emergência', 'fr': 'Urgence'},
    'emergency.noActiveCases': {
      'es': 'No tenés casos de asistencia activos. Si necesitás ayuda urgente, tocá el botón de abajo.',
      'en': "You don't have any active assistance cases. If you need urgent help, tap the button below.",
      'pt': 'Você não tem casos de assistência ativos. Se precisar de ajuda urgente, toque no botão abaixo.',
      'fr': "Vous n'avez aucun dossier d'assistance actif. Si vous avez besoin d'aide urgente, appuyez sur le bouton ci-dessous.",
    },
    'emergency.reportButton': {
      'es': 'Reportar emergencia',
      'en': 'Report emergency',
      'pt': 'Reportar emergência',
      'fr': 'Signaler une urgence',
    },
    'emergency.enableLocationTitle': {
      'es': 'Activá tu ubicación',
      'en': 'Turn on your location',
      'pt': 'Ative sua localização',
      'fr': 'Activez votre localisation',
    },
    'emergency.enableLocationBody': {
      'es': 'Para ubicarte automáticamente y agilizar la asistencia, activá la ubicación del celular. Si no la activás, te vamos a pedir el país y la ciudad a mano antes de enviar.',
      'en': 'To locate you automatically and speed up assistance, turn on your phone\'s location. If you don\'t, we\'ll ask you to enter your country and city manually before sending.',
      'pt': 'Para localizar você automaticamente e agilizar o atendimento, ative a localização do celular. Se não ativar, vamos pedir o país e a cidade manualmente antes de enviar.',
      'fr': "Pour vous localiser automatiquement et accélérer l'assistance, activez la localisation de votre téléphone. Sinon, nous vous demanderons de saisir le pays et la ville manuellement avant l'envoi.",
    },
    'emergency.notNow': {'es': 'Ahora no', 'en': 'Not now', 'pt': 'Agora não', 'fr': 'Pas maintenant'},
    'emergency.enableLocationButton': {
      'es': 'Activar ubicación',
      'en': 'Turn on location',
      'pt': 'Ativar localização',
      'fr': 'Activer la localisation',
    },
    'emergency.loadHealthRecordFirstTitle': {
      'es': 'Cargá tu Ficha de Salud primero',
      'en': 'Add your Health Record first',
      'pt': 'Preencha primeiro seu Histórico de Saúde',
      'fr': "Renseignez d'abord votre dossier de santé",
    },
    'emergency.loadHealthRecordFirstBody': {
      'es': 'Todavía no tenés ningún dato cargado en tu Ficha de Salud (alergias, medicamentos, antecedentes). Es justo la información que necesita quien te atienda en una emergencia — cargala antes de reportar una.',
      'en': "You don't have any information in your Health Record yet (allergies, medications, medical history). That's exactly the information whoever assists you in an emergency needs — add it before reporting one.",
      'pt': 'Você ainda não tem nenhum dado no seu Histórico de Saúde (alergias, medicamentos, antecedentes). É justamente a informação que quem te atender numa emergência vai precisar — preencha antes de reportar uma.',
      'fr': "Vous n'avez encore aucune information dans votre dossier de santé (allergies, médicaments, antécédents). C'est exactement l'information dont la personne qui vous assistera en cas d'urgence aura besoin — ajoutez-la avant de signaler une urgence.",
    },
    'emergency.loadNowButton': {'es': 'Cargar ahora', 'en': 'Add now', 'pt': 'Preencher agora', 'fr': 'Ajouter maintenant'},
    'emergency.creatingCase': {
      'es': 'Creando caso…',
      'en': 'Creating case…',
      'pt': 'Criando caso…',
      'fr': 'Création du dossier…',
    },
    'emergency.createError': {
      'es': 'No se pudo crear el caso. Intentá de nuevo.',
      'en': "Couldn't create the case. Try again.",
      'pt': 'Não foi possível criar o caso. Tente novamente.',
      'fr': "Impossible de créer le dossier. Réessayez.",
    },
    'emergency.whatsHappening': {
      'es': 'Qué está pasando',
      'en': "What's happening",
      'pt': 'O que está acontecendo',
      'fr': 'Que se passe-t-il',
    },
    'emergency.symptomsOptional': {
      'es': 'Síntomas (opcional)',
      'en': 'Symptoms (optional)',
      'pt': 'Sintomas (opcional)',
      'fr': 'Symptômes (facultatif)',
    },
    'emergency.patientConscious': {
      'es': 'El paciente está consciente',
      'en': 'The patient is conscious',
      'pt': 'O paciente está consciente',
      'fr': 'Le patient est conscient',
    },
    'emergency.locationLabel': {'es': 'Ubicación', 'en': 'Location', 'pt': 'Localização', 'fr': 'Emplacement'},
    'emergency.gpsDetectedHint': {
      'es': 'Detectada por GPS — revisala y corregila si hace falta.',
      'en': 'Detected by GPS — check it and correct it if needed.',
      'pt': 'Detectada por GPS — revise e corrija se necessário.',
      'fr': 'Détecté par GPS — vérifiez et corrigez si nécessaire.',
    },
    'emergency.countryLabel': {'es': 'País', 'en': 'Country', 'pt': 'País', 'fr': 'Pays'},
    'emergency.cityLabel': {'es': 'Ciudad', 'en': 'City', 'pt': 'Cidade', 'fr': 'Ville'},
    'emergency.sendButton': {
      'es': 'Enviar — se comparte tu ubicación',
      'en': 'Send — your location will be shared',
      'pt': 'Enviar — sua localização será compartilhada',
      'fr': 'Envoyer — votre position sera partagée',
    },
    'caseChat.caseNumberTitle': {
      'es': 'Caso {number}',
      'en': 'Case {number}',
      'pt': 'Caso {number}',
      'fr': 'Dossier {number}',
    },
    'caseChat.title': {'es': 'Chat del caso', 'en': 'Case chat', 'pt': 'Chat do caso', 'fr': 'Chat du dossier'},
    'caseChat.muteTooltip': {
      'es': 'Dejar de leer los mensajes en voz alta',
      'en': 'Stop reading messages aloud',
      'pt': 'Parar de ler as mensagens em voz alta',
      'fr': 'Arrêter de lire les messages à voix haute',
    },
    'caseChat.unmuteTooltip': {
      'es': 'Leer los mensajes en voz alta',
      'en': 'Read messages aloud',
      'pt': 'Ler as mensagens em voz alta',
      'fr': 'Lire les messages à voix haute',
    },
    'caseChat.closedBanner': {
      'es': 'Este caso está cerrado — no se pueden enviar más mensajes',
      'en': 'This case is closed — no more messages can be sent',
      'pt': 'Este caso está encerrado — não é possível enviar mais mensagens',
      'fr': "Ce dossier est clos — impossible d'envoyer d'autres messages",
    },
    'caseChat.connecting': {'es': 'Conectando…', 'en': 'Connecting…', 'pt': 'Conectando…', 'fr': 'Connexion…'},
    'caseChat.connectError': {
      'es': 'No se pudo conectar al chat.',
      'en': "Couldn't connect to the chat.",
      'pt': 'Não foi possível conectar ao chat.',
      'fr': 'Impossible de se connecter au chat.',
    },
    'caseChat.listening': {'es': 'Escuchando…', 'en': 'Listening…', 'pt': 'Ouvindo…', 'fr': 'Écoute…'},
    'caseChat.speaking': {'es': 'Hablando…', 'en': 'Speaking…', 'pt': 'Falando…', 'fr': 'Parle…'},
    'caseChat.closedFooter': {
      'es': 'Este caso está cerrado. No se pueden enviar más mensajes.',
      'en': 'This case is closed. No more messages can be sent.',
      'pt': 'Este caso está encerrado. Não é possível enviar mais mensagens.',
      'fr': "Ce dossier est clos. Impossible d'envoyer d'autres messages.",
    },
    'caseChat.inputHint': {
      'es': 'Escribí un mensaje…',
      'en': 'Type a message…',
      'pt': 'Digite uma mensagem…',
      'fr': 'Écrivez un message…',
    },
    'caseChat.stopMic': {'es': 'Detener', 'en': 'Stop', 'pt': 'Parar', 'fr': 'Arrêter'},
    'caseChat.startMic': {'es': 'Hablar', 'en': 'Speak', 'pt': 'Falar', 'fr': 'Parler'},
    'caseChat.micPermissionError': {
      'es': 'No se pudo activar el micrófono — revisá el permiso en Ajustes.',
      'en': "Couldn't enable the microphone — check the permission in Settings.",
      'pt': 'Não foi possível ativar o microfone — verifique a permissão nas Configurações.',
      'fr': "Impossible d'activer le microphone — vérifiez l'autorisation dans les paramètres.",
    },
    'caseChat.noConnectionError': {
      'es': 'Sin conexión al chat — el mensaje no se envió, probá de nuevo.',
      'en': "No connection to the chat — the message wasn't sent, try again.",
      'pt': 'Sem conexão com o chat — a mensagem não foi enviada, tente novamente.',
      'fr': "Pas de connexion au chat — le message n'a pas été envoyé, réessayez.",
    },
    'caseChat.sendMessageError': {
      'es': 'No se pudo enviar el mensaje.',
      'en': "Couldn't send the message.",
      'pt': 'Não foi possível enviar a mensagem.',
      'fr': "Impossible d'envoyer le message.",
    },
    'caseChat.confirmSendError': {
      'es': 'No se pudo confirmar el envío — probá de nuevo.',
      'en': "Couldn't confirm the message was sent — try again.",
      'pt': 'Não foi possível confirmar o envio — tente novamente.',
      'fr': "Impossible de confirmer l'envoi — réessayez.",
    },
    'caseDetail.defaultTitle': {
      'es': 'Caso de asistencia',
      'en': 'Assistance case',
      'pt': 'Caso de assistência',
      'fr': "Dossier d'assistance",
    },
    'caseDetail.loadError': {
      'es': 'No se pudo cargar el caso.',
      'en': "Couldn't load the case.",
      'pt': 'Não foi possível carregar o caso.',
      'fr': 'Impossible de charger le dossier.',
    },
    'caseDetail.dateTimeLabel': {'es': 'Fecha y hora', 'en': 'Date and time', 'pt': 'Data e hora', 'fr': 'Date et heure'},
    'caseDetail.whatsHappeningLabel': {
      'es': 'Qué está pasando',
      'en': "What's happening",
      'pt': 'O que está acontecendo',
      'fr': 'Que se passe-t-il',
    },
    'caseDetail.symptomsLabel': {'es': 'Síntomas', 'en': 'Symptoms', 'pt': 'Sintomas', 'fr': 'Symptômes'},
    'caseDetail.locationLabel': {'es': 'Ubicación', 'en': 'Location', 'pt': 'Localização', 'fr': 'Emplacement'},
    'caseDetail.resolutionLabel': {'es': 'Resolución', 'en': 'Resolution', 'pt': 'Resolução', 'fr': 'Résolution'},
    'caseDetail.caseAttentionTitle': {
      'es': 'Atención del caso',
      'en': 'Case updates',
      'pt': 'Atendimento do caso',
      'fr': 'Suivi du dossier',
    },
    'caseDetail.caseAttentionSubtitle': {
      'es': 'Lo que va registrando el call center o el médico a cargo, en orden.',
      'en': "What the call center or attending doctor records, in order.",
      'pt': 'O que a central de atendimento ou o médico responsável vai registrando, em ordem.',
      'fr': "Ce que le centre d'appels ou le médecin en charge enregistre, dans l'ordre.",
    },
    'caseDetail.noEventsYet': {
      'es': 'Todavía no hay novedades registradas en tu caso.',
      'en': 'No updates have been recorded for your case yet.',
      'pt': 'Ainda não há novidades registradas no seu caso.',
      'fr': "Aucune mise à jour n'a encore été enregistrée pour votre dossier.",
    },
    'caseDetail.chatButton': {
      'es': 'Chat con asistencia',
      'en': 'Chat with assistance',
      'pt': 'Chat com assistência',
      'fr': "Chat avec l'assistance",
    },
    'forgotPassword.title': {
      'es': 'Recuperar contraseña',
      'en': 'Recover password',
      'pt': 'Recuperar senha',
      'fr': 'Récupérer le mot de passe',
    },
    'forgotPassword.sentMessage': {
      'es': 'Si el email existe en el sistema, vas a recibir un link para restablecer tu contraseña.',
      'en': "If the email exists in our system, you'll receive a link to reset your password.",
      'pt': 'Se o email existir no sistema, você vai receber um link para redefinir sua senha.',
      'fr': "Si l'email existe dans notre système, vous recevrez un lien pour réinitialiser votre mot de passe.",
    },
    'forgotPassword.instructions': {
      'es': 'Ingresá tu email y te enviamos un link para restablecer tu contraseña.',
      'en': "Enter your email and we'll send you a link to reset your password.",
      'pt': 'Digite seu email e enviaremos um link para redefinir sua senha.',
      'fr': "Saisissez votre email et nous vous enverrons un lien pour réinitialiser votre mot de passe.",
    },
    'forgotPassword.email': {'es': 'Email', 'en': 'Email', 'pt': 'Email', 'fr': 'Email'},
    'forgotPassword.sendLinkButton': {
      'es': 'Enviar link',
      'en': 'Send link',
      'pt': 'Enviar link',
      'fr': 'Envoyer le lien',
    },
    'forgotPassword.backToLogin': {
      'es': 'Volver a iniciar sesión',
      'en': 'Back to log in',
      'pt': 'Voltar para o login',
      'fr': 'Retour à la connexion',
    },
    'verifyEmail.title': {'es': 'Verificá tu email', 'en': 'Verify your email', 'pt': 'Verifique seu email', 'fr': 'Vérifiez votre email'},
    'verifyEmail.logoutTooltip': {'es': 'Cerrar sesión', 'en': 'Log out', 'pt': 'Sair', 'fr': 'Se déconnecter'},
    'verifyEmail.instructions': {
      'es': 'Es el canal directo de comunicación con vos, así que hace falta confirmarlo antes de seguir. Te mandamos un código de 6 dígitos por email — ingresalo acá:',
      'en': "It's our direct channel to reach you, so we need to confirm it before continuing. We sent you a 6-digit code by email — enter it here:",
      'pt': 'É o canal direto de comunicação com você, então é preciso confirmá-lo antes de continuar. Enviamos um código de 6 dígitos por email — digite-o aqui:',
      'fr': "C'est notre canal direct pour vous contacter, il faut donc le confirmer avant de continuer. Nous vous avons envoyé un code à 6 chiffres par email — saisissez-le ici :",
    },
    'verifyEmail.codeLabel': {'es': 'Código', 'en': 'Code', 'pt': 'Código', 'fr': 'Code'},
    'verifyEmail.invalidCodeError': {
      'es': 'Código inválido o vencido.',
      'en': 'Invalid or expired code.',
      'pt': 'Código inválido ou expirado.',
      'fr': 'Code invalide ou expiré.',
    },
    'verifyEmail.resentMessage': {'es': 'Código reenviado.', 'en': 'Code resent.', 'pt': 'Código reenviado.', 'fr': 'Code renvoyé.'},
    'verifyEmail.resendError': {
      'es': 'No se pudo reenviar — probá de nuevo en un momento.',
      'en': "Couldn't resend it — try again in a moment.",
      'pt': 'Não foi possível reenviar — tente novamente em instantes.',
      'fr': "Impossible de le renvoyer — réessayez dans un instant.",
    },
    'verifyEmail.verifying': {'es': 'Verificando…', 'en': 'Verifying…', 'pt': 'Verificando…', 'fr': 'Vérification…'},
    'verifyEmail.verifyButton': {'es': 'Verificar', 'en': 'Verify', 'pt': 'Verificar', 'fr': 'Vérifier'},
    'verifyEmail.resending': {'es': 'Reenviando…', 'en': 'Resending…', 'pt': 'Reenviando…', 'fr': 'Renvoi…'},
    'verifyEmail.resendCodeButton': {
      'es': 'Reenviar código',
      'en': 'Resend code',
      'pt': 'Reenviar código',
      'fr': 'Renvoyer le code',
    },
    'verifyEmail.wrongEmailQuestion': {
      'es': '¿El email está mal escrito?',
      'en': 'Is the email misspelled?',
      'pt': 'O email está escrito errado?',
      'fr': "L'email est mal orthographié ?",
    },
    'verifyEmail.fixInProfile': {
      'es': 'Corregirlo en mi perfil',
      'en': 'Fix it in my profile',
      'pt': 'Corrigir no meu perfil',
      'fr': 'Le corriger dans mon profil',
    },
    'appHelp.greeting': {
      'es': '¡Hola{name}! Preguntame lo que necesites sobre cómo usar MedTravelApp: completar tu Historial de Salud, tu cobertura, o cómo compartirlo con un médico.',
      'en': "Hi{name}! Ask me anything about using MedTravelApp: filling in your Health Record, your coverage, or how to share it with a doctor.",
      'pt': 'Olá{name}! Me pergunte o que precisar sobre como usar o MedTravelApp: preencher seu Histórico de Saúde, sua cobertura, ou como compartilhá-lo com um médico.',
      'fr': "Bonjour{name} ! Demandez-moi tout ce qu'il faut savoir sur l'utilisation de MedTravelApp : remplir votre dossier de santé, votre couverture, ou comment le partager avec un médecin.",
    },
    'appHelp.title': {'es': 'Asistente', 'en': 'Assistant', 'pt': 'Assistente', 'fr': 'Assistant'},
    'appHelp.muteTooltip': {
      'es': 'Dejar de leer las respuestas en voz alta',
      'en': 'Stop reading replies aloud',
      'pt': 'Parar de ler as respostas em voz alta',
      'fr': 'Arrêter de lire les réponses à voix haute',
    },
    'appHelp.unmuteTooltip': {
      'es': 'Leer las respuestas en voz alta',
      'en': 'Read replies aloud',
      'pt': 'Ler as respostas em voz alta',
      'fr': 'Lire les réponses à voix haute',
    },
    'appHelp.voiceRecognitionError': {
      'es': 'No se pudo reconocer la voz ({error}) — probá de nuevo.',
      'en': "Couldn't recognize your voice ({error}) — try again.",
      'pt': 'Não foi possível reconhecer a voz ({error}) — tente novamente.',
      'fr': "Impossible de reconnaître la voix ({error}) — réessayez.",
    },
    'appHelp.micPermissionError': {
      'es': 'No se pudo activar el micrófono — revisá el permiso en Ajustes.',
      'en': "Couldn't enable the microphone — check the permission in Settings.",
      'pt': 'Não foi possível ativar o microfone — verifique a permissão nas Configurações.',
      'fr': "Impossible d'activer le microphone — vérifiez l'autorisation dans les paramètres.",
    },
    'appHelp.answerError': {
      'es': 'No pude responder ahora — probá de nuevo en un momento.',
      'en': "I couldn't answer right now — try again in a moment.",
      'pt': 'Não consegui responder agora — tente novamente em instantes.',
      'fr': "Je n'ai pas pu répondre maintenant — réessayez dans un instant.",
    },
    'appHelp.listening': {'es': 'Escuchando…', 'en': 'Listening…', 'pt': 'Ouvindo…', 'fr': 'Écoute…'},
    'appHelp.speaking': {'es': 'Hablando…', 'en': 'Speaking…', 'pt': 'Falando…', 'fr': 'Parle…'},
    'appHelp.stopButton': {'es': 'Detener', 'en': 'Stop', 'pt': 'Parar', 'fr': 'Arrêter'},
    'appHelp.inputHint': {
      'es': 'Escribí tu pregunta…',
      'en': 'Type your question…',
      'pt': 'Digite sua pergunta…',
      'fr': 'Écrivez votre question…',
    },
    'appHelp.stopMic': {'es': 'Detener', 'en': 'Stop', 'pt': 'Parar', 'fr': 'Arrêter'},
    'appHelp.startMic': {'es': 'Hablar', 'en': 'Speak', 'pt': 'Falar', 'fr': 'Parler'},
    'share.title': {
      'es': 'Compartir con el médico',
      'en': 'Share with your doctor',
      'pt': 'Compartilhar com o médico',
      'fr': 'Partager avec le médecin',
    },
    'share.intro': {
      'es': 'Generá un QR o link para que el médico o institución que te está atendiendo vea tu Historial de Salud sin necesitar cuenta. El médico también puede dejar una nota de la atención.',
      'en': "Generate a QR code or link so the doctor or institution treating you can see your Health Record without needing an account. The doctor can also leave a note about the visit.",
      'pt': 'Gere um QR ou link para que o médico ou instituição que está te atendendo veja seu Histórico de Saúde sem precisar de conta. O médico também pode deixar uma nota do atendimento.',
      'fr': "Générez un QR code ou un lien pour que le médecin ou l'établissement qui vous prend en charge puisse voir votre dossier de santé sans avoir besoin de compte. Le médecin peut aussi laisser une note sur la consultation.",
    },
    'share.doctorEmailLabel': {
      'es': 'Email del médico (opcional)',
      'en': "Doctor's email (optional)",
      'pt': 'Email do médico (opcional)',
      'fr': 'Email du médecin (facultatif)',
    },
    'share.doctorEmailHint': {
      'es': 'Para mandarle el link directamente',
      'en': 'To send them the link directly',
      'pt': 'Para enviar o link diretamente',
      'fr': 'Pour lui envoyer le lien directement',
    },
    'share.languageLabel': {
      'es': 'Idioma de la ficha para el médico',
      'en': "Language of the record for the doctor",
      'pt': 'Idioma da ficha para o médico',
      'fr': 'Langue du dossier pour le médecin',
    },
    'share.languageSpanish': {'es': 'Español', 'en': 'Spanish', 'pt': 'Espanhol', 'fr': 'Espagnol'},
    'share.languageEnglish': {'es': 'Inglés', 'en': 'English', 'pt': 'Inglês', 'fr': 'Anglais'},
    'share.languagePortuguese': {'es': 'Portugués', 'en': 'Portuguese', 'pt': 'Português', 'fr': 'Portugais'},
    'share.languageFrench': {'es': 'Francés', 'en': 'French', 'pt': 'Francês', 'fr': 'Français'},
    'share.generating': {'es': 'Generando…', 'en': 'Generating…', 'pt': 'Gerando…', 'fr': 'Génération…'},
    'share.generateButton': {
      'es': 'Generar QR / link',
      'en': 'Generate QR / link',
      'pt': 'Gerar QR / link',
      'fr': 'Générer QR / lien',
    },
    // Pedido explícito del usuario: "poner una opción para que en la
    // app se pueda ver que es lo que vería el médico de mi historial
    // de salud, sin botones habilitados para el médico" — abre la
    // MISMA página pública que un médico real, con un link de solo
    // lectura (nunca incluye el scope submit_note).
    'share.previewButton': {
      'es': 'Ver cómo lo vería el médico',
      'en': "See what the doctor would see",
      'pt': 'Ver como o médico veria',
      'fr': 'Voir ce que le médecin verrait',
    },
    'share.previewing': {'es': 'Preparando la vista previa…', 'en': 'Preparing preview…', 'pt': 'Preparando a pré-visualização…', 'fr': "Préparation de l'aperçu…"},
    'share.previewError': {
      'es': 'No se pudo abrir la vista previa.',
      'en': "Couldn't open the preview.",
      'pt': 'Não foi possível abrir a pré-visualização.',
      'fr': "Impossible d'ouvrir l'aperçu.",
    },
    'share.sending': {'es': 'Enviando…', 'en': 'Sending…', 'pt': 'Enviando…', 'fr': 'Envoi…'},
    'share.generateAndSendButton': {
      'es': 'Generar y enviar por mail',
      'en': 'Generate and email it',
      'pt': 'Gerar e enviar por email',
      'fr': 'Générer et envoyer par email',
    },
    'share.sentTo': {
      'es': 'Enviado a {email}',
      'en': 'Sent to {email}',
      'pt': 'Enviado para {email}',
      'fr': 'Envoyé à {email}',
    },
    'share.sendEmailError': {
      'es': 'No se pudo enviar el mail. Probá de nuevo.',
      'en': "Couldn't send the email. Try again.",
      'pt': 'Não foi possível enviar o email. Tente novamente.',
      'fr': "Impossible d'envoyer l'email. Réessayez.",
    },
    'share.generateLinkError': {
      'es': 'No se pudo generar el link. Probá de nuevo.',
      'en': "Couldn't generate the link. Try again.",
      'pt': 'Não foi possível gerar o link. Tente novamente.',
      'fr': "Impossible de générer le lien. Réessayez.",
    },
    'share.whatsappMessage': {
      'es': 'Te comparto el acceso a mi Historial de Salud de MedTravelApp: {url}',
      'en': "I'm sharing access to my MedTravelApp Health Record with you: {url}",
      'pt': 'Estou compartilhando o acesso ao meu Histórico de Saúde do MedTravelApp: {url}',
      'fr': "Je vous partage l'accès à mon dossier de santé MedTravelApp : {url}",
    },
    'share.whatsappError': {
      'es': 'No se pudo abrir WhatsApp.',
      'en': "Couldn't open WhatsApp.",
      'pt': 'Não foi possível abrir o WhatsApp.',
      'fr': "Impossible d'ouvrir WhatsApp.",
    },
    'share.expiresOn': {
      'es': 'Vence el {date}',
      'en': 'Expires on {date}',
      'pt': 'Vence em {date}',
      'fr': 'Expire le {date}',
    },
    'share.shareLinkButton': {'es': 'Compartir link', 'en': 'Share link', 'pt': 'Compartilhar link', 'fr': 'Partager le lien'},
    'share.sendWhatsAppButton': {
      'es': 'Enviar por WhatsApp',
      'en': 'Send via WhatsApp',
      'pt': 'Enviar por WhatsApp',
      'fr': 'Envoyer via WhatsApp',
    },
    'share.sendEmailButton': {'es': 'Enviar por mail', 'en': 'Send by email', 'pt': 'Enviar por email', 'fr': 'Envoyer par email'},
    'share.generateAnotherButton': {
      'es': 'Generar otro',
      'en': 'Generate another',
      'pt': 'Gerar outro',
      'fr': 'Générer un autre',
    },
    'share.lastSentTo': {
      'es': 'Último envío por mail: {email}',
      'en': 'Last sent by email to: {email}',
      'pt': 'Último envio por email: {email}',
      'fr': 'Dernier envoi par email à : {email}',
    },
    'assistant.chooserTitle': {
      'es': '¿Cómo querés cargar tu Ficha de Salud?',
      'en': 'How would you like to fill in your Health Record?',
      'pt': 'Como você quer preencher seu Histórico de Saúde?',
      'fr': 'Comment souhaitez-vous remplir votre dossier de santé ?',
    },
    'assistant.classicTitle': {'es': 'Modo clásico', 'en': 'Classic mode', 'pt': 'Modo clássico', 'fr': 'Mode classique'},
    'assistant.classicSubtitle': {
      'es': 'Charla libre, la IA conduce la entrevista',
      'en': 'Free conversation, the AI guides the interview',
      'pt': 'Conversa livre, a IA conduz a entrevista',
      'fr': "Conversation libre, l'IA mène l'entretien",
    },
    'assistant.structuredTitle': {
      'es': 'Modo estructurado',
      'en': 'Structured mode',
      'pt': 'Modo estruturado',
      'fr': 'Mode structuré',
    },
    'assistant.structuredSubtitle': {
      'es': 'Preguntas guiadas por IA',
      'en': 'AI-guided questions',
      'pt': 'Perguntas guiadas por IA',
      'fr': "Questions guidées par l'IA",
    },
    'assistant.formTitle': {'es': 'Formulario', 'en': 'Form', 'pt': 'Formulário', 'fr': 'Formulaire'},
    'assistant.formSubtitle': {
      'es': 'Preguntas en pantalla validadas por IA',
      'en': 'On-screen questions validated by AI',
      'pt': 'Perguntas na tela validadas por IA',
      'fr': "Questions à l'écran validées par l'IA",
    },
    'assistant.chatTitleClassic': {
      'es': 'Asistente de salud',
      'en': 'Health assistant',
      'pt': 'Assistente de saúde',
      'fr': 'Assistant santé',
    },
    'assistant.chatTitleStructured': {
      'es': 'Asistente de salud (Estructurado)',
      'en': 'Health assistant (Structured)',
      'pt': 'Assistente de saúde (Estruturado)',
      'fr': 'Assistant santé (Structuré)',
    },
    'assistant.saveAndExitTitle': {
      'es': '¿Guardar y salir?',
      'en': 'Save and exit?',
      'pt': 'Salvar e sair?',
      'fr': 'Enregistrer et quitter ?',
    },
    'assistant.dateWarningTitle': {
      'es': 'Revisá esto',
      'en': 'Please check this',
      'pt': 'Revise isto',
      'fr': 'Vérifiez ceci',
    },
    'assistant.saveAndExitBody': {
      'es': 'Se guarda todo lo que ya contestaste hasta ahora en tu Historial de Salud, aunque no hayas terminado todas las preguntas.',
      'en': "Everything you've answered so far will be saved to your Health Record, even if you haven't finished all the questions.",
      'pt': 'Tudo o que você já respondeu até agora será salvo no seu Histórico de Saúde, mesmo que não tenha terminado todas as perguntas.',
      'fr': "Tout ce que vous avez déjà répondu sera enregistré dans votre dossier de santé, même si vous n'avez pas terminé toutes les questions.",
    },
    'assistant.cancel': {'es': 'Cancelar', 'en': 'Cancel', 'pt': 'Cancelar', 'fr': 'Annuler'},
    'assistant.saveAndExitButton': {
      'es': 'Guardar y salir',
      'en': 'Save and exit',
      'pt': 'Salvar e sair',
      'fr': 'Enregistrer et quitter',
    },
    'assistant.confirmChangeBody': {
      'es': 'Ya tenés "{existing}" registrada. ¿Confirmás que ahora es "{updated}"?',
      'en': 'You already have "{existing}" recorded. Do you confirm it is now "{updated}"?',
      'pt': 'Você já tem "{existing}" registrada. Confirma que agora é "{updated}"?',
      'fr': 'Vous avez déjà « {existing} » enregistrée. Confirmez-vous que c\'est maintenant « {updated} » ?',
    },
    'assistant.confirmChangeTitle': {
      'es': '¿Confirmás el cambio?',
      'en': 'Confirm the change?',
      'pt': 'Confirmar a alteração?',
      'fr': 'Confirmer le changement ?',
    },
    'assistant.no': {'es': 'No', 'en': 'No', 'pt': 'Não', 'fr': 'Non'},
    'assistant.yes': {'es': 'Sí', 'en': 'Yes', 'pt': 'Sim', 'fr': 'Oui'},
    'assistant.yesReplace': {
      'es': 'Sí, reemplazar',
      'en': 'Yes, replace',
      'pt': 'Sim, substituir',
      'fr': 'Oui, remplacer',
    },
    'assistant.unconfirmedDataTitle': {
      'es': 'Tenés datos sin confirmar',
      'en': 'You have unconfirmed information',
      'pt': 'Você tem dados não confirmados',
      'fr': 'Vous avez des informations non confirmées',
    },
    'assistant.unconfirmedDataBody': {
      'es': 'Todavía no se guardó esto — ¿qué querés hacer?',
      'en': "This hasn't been saved yet — what would you like to do?",
      'pt': 'Isso ainda não foi salvo — o que você quer fazer?',
      'fr': "Ceci n'a pas encore été enregistré — que voulez-vous faire ?",
    },
    'assistant.keepGoingHere': {'es': 'Seguir acá', 'en': 'Keep going here', 'pt': 'Continuar aqui', 'fr': 'Continuer ici'},
    'assistant.discard': {'es': 'Descartar', 'en': 'Discard', 'pt': 'Descartar', 'fr': 'Ignorer'},
    'assistant.confirmAll': {
      'es': 'Confirmar todo',
      'en': 'Confirm everything',
      'pt': 'Confirmar tudo',
      'fr': 'Tout confirmer',
    },
    'assistant.thinkingIndicator': {
      'es': 'Pensando…',
      'en': 'Thinking…',
      'pt': 'Pensando…',
      'fr': 'Réflexion…',
    },
    'assistant.micUnresponsiveError': {
      'es': 'El micrófono no responde — tocá el ícono para intentar de nuevo.',
      'en': "The microphone isn't responding — tap the icon to try again.",
      'pt': 'O microfone não está respondendo — toque no ícone para tentar novamente.',
      'fr': "Le microphone ne répond pas — appuyez sur l'icône pour réessayer.",
    },
    'assistant.stillListeningCheckIn': {
      'es': '¿Seguís ahí? Cuando quieras contame, o decime "guardar y salir" si querés cortar acá.',
      'en': "Still there? Whenever you're ready, go ahead — or say “save and exit” if you'd like to stop here.",
      'pt': 'Ainda está aí? Quando quiser, me conte — ou diga "salvar e sair" se quiser parar por aqui.',
      'fr': "Toujours là ? Quand vous voulez, dites-moi — ou dites « enregistrer et quitter » pour vous arrêter ici.",
    },
    'assistant.micAutoRestarted': {
      'es': 'Se cortó la escucha — reinicié el micrófono. Repetí lo último, por las dudas.',
      'en': 'Listening stopped unexpectedly — restarted the microphone. Please repeat your last answer, just in case.',
      'pt': 'A escuta foi interrompida — reiniciei o microfone. Repita sua última resposta, por via das dúvidas.',
      'fr': "L'écoute s'est interrompue — le micro a été relancé. Répétez votre dernière réponse, au cas où.",
    },
    'assistant.saveTimeoutError': {
      'es': 'El guardado está tardando demasiado — probá de nuevo con "Guardar y salir".',
      'en': 'Saving is taking too long — try "Save and exit" again.',
      'pt': 'Salvar está demorando demais — tente "Salvar e sair" novamente.',
      'fr': "L'enregistrement prend trop de temps — réessayez avec « Enregistrer et quitter ».",
    },
    'assistant.resumeTitle': {
      'es': 'Tenés una carga sin terminar',
      'en': "You have an unfinished entry",
      'pt': 'Você tem um registro sem terminar',
      'fr': 'Vous avez une saisie non terminée',
    },
    'assistant.resumeBody': {
      'es': 'La última vez se cortó antes de guardar esto en tu Historial de Salud:',
      'en': 'Last time it was interrupted before saving this to your Health Record:',
      'pt': 'Da última vez foi interrompido antes de salvar isto no seu Histórico de Saúde:',
      'fr': "La dernière fois, ça s'est interrompu avant d'enregistrer ceci dans votre dossier de santé :",
    },
    'assistant.resumeDiscard': {
      'es': 'Descartar', 'en': 'Discard', 'pt': 'Descartar', 'fr': 'Ignorer',
    },
    'assistant.resumeSave': {
      'es': 'Guardar ahora', 'en': 'Save now', 'pt': 'Salvar agora', 'fr': 'Enregistrer maintenant',
    },
    'assistant.resumeSaved': {
      'es': 'Listo, se guardó lo que habías contado la vez pasada.',
      'en': "Done — what you told us last time has been saved.",
      'pt': 'Pronto — o que você contou da última vez foi salvo.',
      'fr': "C'est fait — ce que vous aviez raconté la dernière fois a été enregistré.",
    },
    'assistant.resumeSaveError': {
      'es': 'No se pudo guardar — lo seguís teniendo pendiente, probá de nuevo más tarde.',
      'en': "Couldn't save it — it's still pending, try again later.",
      'pt': 'Não foi possível salvar — ainda está pendente, tente novamente mais tarde.',
      'fr': "Impossible d'enregistrer — c'est toujours en attente, réessayez plus tard.",
    },
    'assistant.voiceRecognitionError': {
      'es': 'No se pudo reconocer la voz ({error}) — probá de nuevo.',
      'en': "Couldn't recognize your voice ({error}) — try again.",
      'pt': 'Não foi possível reconhecer a voz ({error}) — tente novamente.',
      'fr': "Impossible de reconnaître la voix ({error}) — réessayez.",
    },
    'assistant.ttsPlaybackError': {
      'es': 'No se pudo reproducir la respuesta en voz alta ({message}).',
      'en': "Couldn't play the reply aloud ({message}).",
      'pt': 'Não foi possível reproduzir a resposta em voz alta ({message}).',
      'fr': "Impossible de lire la réponse à voix haute ({message}).",
    },
    'assistant.micStoppedError': {
      'es': 'El micrófono dejó de responder — tocá el ícono para intentar de nuevo.',
      'en': 'The microphone stopped responding — tap the icon to try again.',
      'pt': 'O microfone parou de responder — toque no ícone para tentar novamente.',
      'fr': "Le microphone a cessé de répondre — appuyez sur l'icône pour réessayer.",
    },
    'assistant.noVoiceDetectedError': {
      'es': 'No se detectó voz — tocá el ícono del micrófono cuando quieras seguir.',
      'en': 'No voice detected — tap the microphone icon when you want to continue.',
      'pt': 'Nenhuma voz detectada — toque no ícone do microfone quando quiser continuar.',
      'fr': "Aucune voix détectée — appuyez sur l'icône du microphone quand vous voulez continuer.",
    },
    'assistant.micPermissionError': {
      'es': 'No se pudo activar el micrófono — revisá el permiso en Ajustes.',
      'en': "Couldn't enable the microphone — check the permission in Settings.",
      'pt': 'Não foi possível ativar o microfone — verifique a permissão nas Configurações.',
      'fr': "Impossible d'activer le microphone — vérifiez l'autorisation dans les paramètres.",
    },
    'assistant.tellUsWhich': {
      'es': 'Contame cuál — escribilo o decilo por voz.',
      'en': 'Tell me which one — type it or say it.',
      'pt': 'Me conte qual — digite ou diga por voz.',
      'fr': 'Dites-moi lequel — écrivez-le ou dites-le à voix haute.',
    },
    'assistant.confirmEverythingQuestion': {
      'es': '¿Confirmamos todo lo que hablamos?',
      'en': 'Shall we confirm everything we discussed?',
      'pt': 'Vamos confirmar tudo o que conversamos?',
      'fr': 'On confirme tout ce dont nous avons parlé ?',
    },
    'assistant.fixSomething': {'es': 'Corregir algo', 'en': 'Fix something', 'pt': 'Corrigir algo', 'fr': 'Corriger quelque chose'},
    'assistant.savedCanReturn': {
      'es': 'Guardado. Podés volver cuando quieras.',
      'en': 'Saved. You can come back whenever you want.',
      'pt': 'Salvo. Você pode voltar quando quiser.',
      'fr': 'Enregistré. Vous pouvez revenir quand vous voulez.',
    },
    'assistant.close': {'es': 'Cerrar', 'en': 'Close', 'pt': 'Fechar', 'fr': 'Fermer'},
    'assistant.listening': {'es': 'Escuchando…', 'en': 'Listening…', 'pt': 'Ouvindo…', 'fr': 'Écoute…'},
    'assistant.speaking': {'es': 'Hablando…', 'en': 'Speaking…', 'pt': 'Falando…', 'fr': 'Parle…'},
    'assistant.stop': {'es': 'Detener', 'en': 'Stop', 'pt': 'Parar', 'fr': 'Arrêter'},
    'assistant.classicInputHint': {
      'es': 'Contame tus antecedentes…',
      'en': 'Tell me about your medical history…',
      'pt': 'Me conte seus antecedentes…',
      'fr': 'Parlez-moi de vos antécédents…',
    },
    'assistant.speak': {'es': 'Hablar', 'en': 'Speak', 'pt': 'Falar', 'fr': 'Parler'},
    'realtimeAssistant.proposalCondition': {'es': 'Enfermedad', 'en': 'Condition', 'pt': 'Doença', 'fr': 'Maladie'},
    'realtimeAssistant.proposalMedication': {'es': 'Medicamento', 'en': 'Medication', 'pt': 'Medicamento', 'fr': 'Médicament'},
    'realtimeAssistant.proposalAllergy': {'es': 'Alergia', 'en': 'Allergy', 'pt': 'Alergia', 'fr': 'Allergie'},
    'realtimeAssistant.proposalSurgery': {'es': 'Cirugía', 'en': 'Surgery', 'pt': 'Cirurgia', 'fr': 'Chirurgie'},
    'realtimeAssistant.proposalVitals': {'es': 'Datos básicos', 'en': 'Basic information', 'pt': 'Dados básicos', 'fr': 'Informations de base'},
    'realtimeAssistant.proposalLabResult': {'es': 'Estudio', 'en': 'Lab result', 'pt': 'Exame', 'fr': 'Analyse'},
    'realtimeAssistant.proposalImplant': {
      'es': 'Implante/dispositivo',
      'en': 'Implant/device',
      'pt': 'Implante/dispositivo',
      'fr': 'Implant/appareil',
    },
    'realtimeAssistant.proposalTreatment': {
      'es': 'Tratamiento',
      'en': 'Treatment',
      'pt': 'Tratamento',
      'fr': 'Traitement',
    },
    'realtimeAssistant.connectionLost': {
      'es': 'Se cortó la conexión de voz.',
      'en': 'The voice connection was lost.',
      'pt': 'A conexão de voz foi perdida.',
      'fr': 'La connexion vocale a été perdue.',
    },
    'realtimeAssistant.processingPauseIndicator': {
      'es': 'Procesando lo que me contaste — seguimos en un momento…',
      'en': 'Processing what you told me — we\'ll continue in a moment…',
      'pt': 'Processando o que você me contou — continuamos em instantes…',
      'fr': 'Je traite ce que vous venez de me dire — on continue dans un instant…',
    },
    'realtimeAssistant.processingPause': {
      'es': 'Contaste bastante de una — dame unos segundos para terminar de guardarlo todo. Para que fluya mejor, contame de a 2 o 3 cosas por vez y esperá mi respuesta antes de seguir.',
      'en': "That's a lot to take in at once — give me a few seconds to finish saving it all. It flows better if you tell me 2 or 3 things at a time and wait for my reply before continuing.",
      'pt': 'Você me contou bastante de uma vez — me dê alguns segundos para terminar de salvar tudo. Fica melhor se você me contar 2 ou 3 coisas por vez e esperar minha resposta antes de continuar.',
      'fr': "Vous m'avez donné beaucoup d'informations d'un coup — laissez-moi quelques secondes pour tout enregistrer. Ça ira mieux si vous me dites 2 ou 3 choses à la fois en attendant ma réponse avant de continuer.",
    },
    'realtimeAssistant.recordDeleted': {'es': 'Eliminado', 'en': 'Deleted', 'pt': 'Excluído', 'fr': 'Supprimé'},
    'realtimeAssistant.recordUpdated': {'es': 'Actualizado', 'en': 'Updated', 'pt': 'Atualizado', 'fr': 'Mis à jour'},
    'realtimeAssistant.saveAndExitTooltip': {
      'es': 'Guardar y salir',
      'en': 'Save and exit',
      'pt': 'Salvar e sair',
      'fr': 'Enregistrer et quitter',
    },
    'realtimeAssistant.genericError': {
      'es': 'Ocurrió un error.',
      'en': 'An error occurred.',
      'pt': 'Ocorreu um erro.',
      'fr': "Une erreur s'est produite.",
    },
    'realtimeAssistant.connectingToVoiceAssistant': {
      'es': 'Conectando con el asistente de voz…',
      'en': 'Connecting to the voice assistant…',
      'pt': 'Conectando ao assistente de voz…',
      'fr': "Connexion à l'assistant vocal…",
    },
    'realtimeAssistant.listeningNaturally': {
      'es': 'Escuchando — hablá con naturalidad',
      'en': 'Listening — speak naturally',
      'pt': 'Ouvindo — fale naturalmente',
      'fr': 'Écoute en cours — parlez naturellement',
    },
    'realtimeAssistant.retry': {'es': 'Reintentar', 'en': 'Retry', 'pt': 'Tentar novamente', 'fr': 'Réessayer'},
    'realtimeAssistant.savedOne': {
      'es': 'Guardado en tu Historial de Salud (1 antecedente).',
      'en': 'Saved to your Health Record (1 entry).',
      'pt': 'Salvo no seu Histórico de Saúde (1 antecedente).',
      'fr': 'Enregistré dans votre dossier de santé (1 entrée).',
    },
    'realtimeAssistant.savedMany': {
      'es': 'Guardado en tu Historial de Salud ({count} antecedentes).',
      'en': 'Saved to your Health Record ({count} entries).',
      'pt': 'Salvo no seu Histórico de Saúde ({count} antecedentes).',
      'fr': 'Enregistré dans votre dossier de santé ({count} entrées).',
    },
    'realtimeAssistant.discardedNothing': {
      'es': 'Listo, no se guardó nada de esta conversación.',
      'en': "Done — nothing from this conversation was saved.",
      'pt': 'Pronto, nada desta conversa foi salvo.',
      'fr': "Terminé — rien de cette conversation n'a été enregistré.",
    },
    'form.title': {
      'es': 'Ficha de salud — Formulario',
      'en': 'Health Record — Form',
      'pt': 'Histórico de saúde — Formulário',
      'fr': 'Dossier de santé — Formulaire',
    },
    'form.removeExistingTitle': {
      'es': '¿Quitar este dato ya cargado?',
      'en': 'Remove this saved entry?',
      'pt': 'Remover este dado já salvo?',
      'fr': 'Supprimer cette entrée déjà enregistrée ?',
    },
    'form.removeExistingBody': {
      'es': '"{item}" ya estaba en tu Historial de Salud. Si lo destildás/borrás acá, se va a quitar de tu ficha real, no solo de este formulario.',
      'en': '"{item}" was already in your Health Record. If you uncheck/remove it here, it will be removed from your actual record, not just from this form.',
      'pt': '"{item}" já estava no seu Histórico de Saúde. Se você desmarcar/remover aqui, ele será removido da sua ficha real, não só deste formulário.',
      'fr': '« {item} » figurait déjà dans votre dossier de santé. Si vous le décochez/supprimez ici, il sera retiré de votre dossier réel, pas seulement de ce formulaire.',
    },
    'form.remove': {'es': 'Quitar', 'en': 'Remove', 'pt': 'Remover', 'fr': 'Supprimer'},
    'form.removeError': {
      'es': 'No se pudo quitar — probá de nuevo.',
      'en': "Couldn't remove it — try again.",
      'pt': 'Não foi possível remover — tente novamente.',
      'fr': "Impossible de supprimer — réessayez.",
    },
    'form.saveError': {
      'es': 'No se pudo guardar el formulario — probá de nuevo.',
      'en': "Couldn't save the form — try again.",
      'pt': 'Não foi possível salvar o formulário — tente novamente.',
      'fr': "Impossible d'enregistrer le formulaire — réessayez.",
    },
    'form.someEditsFailed': {
      'es': 'Algunas correcciones no se pudieron guardar — revisalas y volvé a intentar:',
      'en': "Some corrections couldn't be saved — review them and try again:",
      'pt': 'Algumas correções não puderam ser salvas — revise e tente novamente:',
      'fr': "Certaines corrections n'ont pas pu être enregistrées — vérifiez-les et réessayez :",
    },
    'form.errorDialogTitle': {
      'es': 'No se pudo guardar', 'en': "Couldn't save",
      'pt': 'Não foi possível salvar', 'fr': "Impossible d'enregistrer",
    },
    'form.errorDialogOk': {
      'es': 'Entendido', 'en': 'Got it', 'pt': 'Entendi', 'fr': "J'ai compris",
    },
    'form.reviewTitle': {
      'es': 'Revisar antes de guardar',
      'en': 'Review before saving',
      'pt': 'Revisar antes de salvar',
      'fr': "Vérifier avant d'enregistrer",
    },
    'form.aiCorrectedText': {
      'es': 'La IA corrigió estos textos:',
      'en': 'The AI corrected this text:',
      'pt': 'A IA corrigiu estes textos:',
      'fr': "L'IA a corrigé ces textes :",
    },
    'form.confirmAndSaveButton': {
      'es': 'Confirmar y guardar',
      'en': 'Confirm and save',
      'pt': 'Confirmar e salvar',
      'fr': 'Confirmer et enregistrer',
    },
    'form.intro': {
      'es': 'Completá los datos que tengas — no hace falta llenar todo. Al final revisamos juntos antes de guardar.',
      'en': "Fill in whatever information you have — you don't need to complete everything. At the end we'll review it together before saving.",
      'pt': 'Preencha os dados que tiver — não precisa preencher tudo. No final revisamos juntos antes de salvar.',
      'fr': "Remplissez les informations que vous avez — inutile de tout compléter. À la fin, nous vérifierons ensemble avant d'enregistrer.",
    },
    'form.lastUpdated': {
      'es': 'Última actualización de tu ficha: {date}',
      'en': 'Last update to your record: {date}',
      'pt': 'Última atualização da sua ficha: {date}',
      'fr': 'Dernière mise à jour de votre dossier : {date}',
    },
    'form.basicDataSection': {'es': 'Datos básicos', 'en': 'Basic information', 'pt': 'Dados básicos', 'fr': 'Informations de base'},
    'form.birthDateLabel': {
      'es': 'Fecha de nacimiento (DD/MM/AAAA)',
      'en': 'Date of birth (DD/MM/YYYY)',
      'pt': 'Data de nascimento (DD/MM/AAAA)',
      'fr': 'Date de naissance (JJ/MM/AAAA)',
    },
    'form.sexLabel': {'es': 'Sexo', 'en': 'Sex', 'pt': 'Sexo', 'fr': 'Sexe'},
    'form.sexMale': {'es': 'Masculino', 'en': 'Male', 'pt': 'Masculino', 'fr': 'Masculin'},
    'form.sexFemale': {'es': 'Femenino', 'en': 'Female', 'pt': 'Feminino', 'fr': 'Féminin'},
    'form.sexOther': {'es': 'Otro', 'en': 'Other', 'pt': 'Outro', 'fr': 'Autre'},
    'form.sexPreferNotToSay': {
      'es': 'Prefiero no decir',
      'en': 'Prefer not to say',
      'pt': 'Prefiro não dizer',
      'fr': 'Préfère ne pas préciser',
    },
    'form.weightLabel': {'es': 'Peso (kg)', 'en': 'Weight (kg)', 'pt': 'Peso (kg)', 'fr': 'Poids (kg)'},
    'form.heightLabel': {'es': 'Altura (cm)', 'en': 'Height (cm)', 'pt': 'Altura (cm)', 'fr': 'Taille (cm)'},
    'form.bloodTypeLabel': {'es': 'Grupo sanguíneo', 'en': 'Blood type', 'pt': 'Tipo sanguíneo', 'fr': 'Groupe sanguin'},
    'form.medicalHistorySection': {
      'es': 'Antecedentes médicos',
      'en': 'Medical history',
      'pt': 'Antecedentes médicos',
      'fr': 'Antécédents médicaux',
    },
    'form.medicalHistoryHint': {
      'es': 'Marcá los que tengas o hayas tenido.',
      'en': 'Check the ones you have or have had.',
      'pt': 'Marque os que você tem ou já teve.',
      'fr': 'Cochez ceux que vous avez ou avez eus.',
    },
    'form.allergiesSection': {'es': 'Alergias', 'en': 'Allergies', 'pt': 'Alergias', 'fr': 'Allergies'},
    'form.addAllergyButton': {'es': 'Agregar alergia', 'en': 'Add allergy', 'pt': 'Adicionar alergia', 'fr': 'Ajouter une allergie'},
    'form.medicationsSection': {
      'es': 'Medicamentos que toma habitualmente',
      'en': 'Medications you regularly take',
      'pt': 'Medicamentos que você toma habitualmente',
      'fr': 'Médicaments que vous prenez habituellement',
    },
    'form.addMedicationButton': {
      'es': 'Agregar medicamento',
      'en': 'Add medication',
      'pt': 'Adicionar medicamento',
      'fr': 'Ajouter un médicament',
    },
    'form.surgeriesSection': {'es': 'Cirugías', 'en': 'Surgeries', 'pt': 'Cirurgias', 'fr': 'Chirurgies'},
    'form.surgeryNameLabel': {'es': 'Cirugía', 'en': 'Surgery', 'pt': 'Cirurgia', 'fr': 'Chirurgie'},
    'form.addSurgeryButton': {'es': 'Agregar cirugía', 'en': 'Add surgery', 'pt': 'Adicionar cirurgia', 'fr': 'Ajouter une chirurgie'},
    'form.implantsSection': {
      'es': 'Implantes y dispositivos médicos',
      'en': 'Implants and medical devices',
      'pt': 'Implantes e dispositivos médicos',
      'fr': 'Implants et appareils médicaux',
    },
    'form.implantNameLabel': {
      'es': 'Implante/dispositivo',
      'en': 'Implant/device',
      'pt': 'Implante/dispositivo',
      'fr': 'Implant/appareil',
    },
    'form.addImplantButton': {
      'es': 'Agregar implante',
      'en': 'Add implant',
      'pt': 'Adicionar implante',
      'fr': 'Ajouter un implant',
    },
    'form.validateAndSaveButton': {
      'es': 'Validar y guardar',
      'en': 'Validate and save',
      'pt': 'Validar e salvar',
      'fr': 'Valider et enregistrer',
    },
    'form.approxDateLabel': {'es': 'Fecha aprox.', 'en': 'Approx. date', 'pt': 'Data aprox.', 'fr': 'Date approx.'},
    'form.conditionTypeLabel': {'es': 'Tipo', 'en': 'Type', 'pt': 'Tipo', 'fr': 'Type'},
    'form.whichLabel': {'es': 'Cuál', 'en': 'Which', 'pt': 'Qual', 'fr': 'Lequel'},
    'form.detailOptionalLabel': {
      'es': 'Detalle (opcional)',
      'en': 'Detail (optional)',
      'pt': 'Detalhe (opcional)',
      'fr': 'Détail (facultatif)',
    },
    'form.allergyWhatLabel': {
      'es': 'A qué es alérgico',
      'en': 'What they are allergic to',
      'pt': 'A que é alérgico',
      'fr': 'À quoi il/elle est allergique',
    },
    'form.allergyTypeMedication': {'es': 'Medicamento', 'en': 'Medication', 'pt': 'Medicamento', 'fr': 'Médicament'},
    'form.allergyTypeFood': {'es': 'Alimento', 'en': 'Food', 'pt': 'Alimento', 'fr': 'Aliment'},
    'form.allergyTypeEnvironmental': {'es': 'Ambiental', 'en': 'Environmental', 'pt': 'Ambiental', 'fr': 'Environnemental'},
    'form.allergyTypeOther': {'es': 'Otra', 'en': 'Other', 'pt': 'Outro', 'fr': 'Autre'},
    'form.severityLabel': {'es': 'Gravedad', 'en': 'Severity', 'pt': 'Gravidade', 'fr': 'Sévérité'},
    'form.severityMild': {'es': 'Leve', 'en': 'Mild', 'pt': 'Leve', 'fr': 'Légère'},
    'form.severityModerate': {'es': 'Moderada', 'en': 'Moderate', 'pt': 'Moderada', 'fr': 'Modérée'},
    'form.severitySevere': {'es': 'Severa', 'en': 'Severe', 'pt': 'Grave', 'fr': 'Sévère'},
    'form.severityCritical': {
      'es': 'Riesgo de vida',
      'en': 'Life-threatening',
      'pt': 'Risco de vida',
      'fr': 'Risque vital',
    },
    'form.medicationNameLabel': {'es': 'Medicamento', 'en': 'Medication', 'pt': 'Medicamento', 'fr': 'Médicament'},
    'form.doseLabel': {'es': 'Dosis', 'en': 'Dose', 'pt': 'Dose', 'fr': 'Dose'},
    'form.sinceWhenLabel': {'es': 'Desde cuándo', 'en': 'Since when', 'pt': 'Desde quando', 'fr': 'Depuis quand'},
    'form.updatedExistingDataOne': {
      'es': 'Se actualizó 1 dato ya cargado.',
      'en': '1 existing entry was updated.',
      'pt': '1 dado já cadastrado foi atualizado.',
      'fr': '1 entrée existante a été mise à jour.',
    },
    'form.updatedExistingDataMany': {
      'es': 'Se actualizaron {count} datos ya cargados.',
      'en': '{count} existing entries were updated.',
      'pt': '{count} dados já cadastrados foram atualizados.',
      'fr': '{count} entrées existantes ont été mises à jour.',
    },
    'form.willSaveDataOne': {
      'es': 'Se va a guardar 1 dato nuevo o actualizado en tu Historial de Salud.',
      'en': '1 new or updated entry will be saved to your Health Record.',
      'pt': '1 dado novo ou atualizado vai ser salvo no seu Histórico de Saúde.',
      'fr': '1 entrée nouvelle ou mise à jour sera enregistrée dans votre dossier de santé.',
    },
    'form.willSaveDataMany': {
      'es': 'Se van a guardar {count} datos nuevos o actualizados en tu Historial de Salud.',
      'en': '{count} new or updated entries will be saved to your Health Record.',
      'pt': '{count} dados novos ou atualizados vão ser salvos no seu Histórico de Saúde.',
      'fr': '{count} entrées nouvelles ou mises à jour seront enregistrées dans votre dossier de santé.',
    },
    'form.noChangesToSave': {
      'es': 'No hay cambios nuevos para guardar.',
      'en': 'There are no new changes to save.',
      'pt': 'Não há alterações novas para salvar.',
      'fr': "Il n'y a aucune nouvelle modification à enregistrer.",
    },
    'form.fillAtLeastOne': {
      'es': 'Completá al menos un dato antes de guardar.',
      'en': 'Fill in at least one field before saving.',
      'pt': 'Preencha pelo menos um dado antes de salvar.',
      'fr': "Renseignez au moins une information avant d'enregistrer.",
    },
    'register.title': {'es': 'Crear cuenta', 'en': 'Create account', 'pt': 'Criar conta', 'fr': 'Créer un compte'},
    'register.error': {
      'es': 'No se pudo registrar — el email o el documento ya podrían estar en uso.',
      'en': "Couldn't register — the email or document may already be in use.",
      'pt': 'Não foi possível cadastrar — o email ou documento já podem estar em uso.',
      'fr': "Impossible de s'inscrire — l'email ou le document sont peut-être déjà utilisés.",
    },
    'register.languagePrompt': {
      'es': 'Idioma / Language / Idioma / Langue',
      'en': 'Idioma / Language / Idioma / Langue',
      'pt': 'Idioma / Language / Idioma / Langue',
      'fr': 'Idioma / Language / Idioma / Langue',
    },
    'register.firstName': {'es': 'Nombre', 'en': 'First name', 'pt': 'Nome', 'fr': 'Prénom'},
    'register.lastName': {'es': 'Apellido', 'en': 'Last name', 'pt': 'Sobrenome', 'fr': 'Nom'},
    'register.email': {'es': 'Email', 'en': 'Email', 'pt': 'Email', 'fr': 'Email'},
    'register.confirmEmail': {
      'es': 'Confirmar email',
      'en': 'Confirm email',
      'pt': 'Confirmar email',
      'fr': "Confirmer l'email",
    },
    'register.confirmEmailHelper': {
      'es': 'Repetilo para evitar errores de tipeo',
      'en': 'Type it again to avoid typos',
      'pt': 'Repita para evitar erros de digitação',
      'fr': "Retapez-le pour éviter les fautes de frappe",
    },
    'register.confirmEmailMismatch': {
      'es': 'No coincide con el email de arriba',
      'en': "Doesn't match the email above",
      'pt': 'Não coincide com o email acima',
      'fr': "Ne correspond pas à l'email ci-dessus",
    },
    'register.password': {'es': 'Contraseña', 'en': 'Password', 'pt': 'Senha', 'fr': 'Mot de passe'},
    'register.passwordHelper': {
      'es': 'Mínimo 8 caracteres',
      'en': 'At least 8 characters',
      'pt': 'Mínimo de 8 caracteres',
      'fr': 'Au moins 8 caractères',
    },
    'register.passwordMissingChars': {
      'es': 'Le faltan {n} caracteres',
      'en': '{n} more characters needed',
      'pt': 'Faltam {n} caracteres',
      'fr': 'Il manque {n} caractères',
    },
    'register.phone': {
      'es': 'Celular (opcional)',
      'en': 'Mobile phone (optional)',
      'pt': 'Celular (opcional)',
      'fr': 'Téléphone portable (facultatif)',
    },
    'register.phoneHelper': {
      'es': 'Con código de país, ej. +54 9 11 1234-5678',
      'en': 'With country code, e.g. +1 415 555 0100',
      'pt': 'Com código do país, ex. +55 11 91234-5678',
      'fr': 'Avec indicatif pays, ex. +33 6 12 34 56 78',
    },
    'register.documentSectionTitle': {
      'es': 'Documento de identidad',
      'en': 'Identity document',
      'pt': 'Documento de identidade',
      'fr': "Pièce d'identité",
    },
    'register.documentExplain': {
      'es': 'Lo pedimos para relacionar tu cuenta con la póliza de asistencia al viajero contratada.',
      'en': "We ask for this to link your account to your travel assistance policy.",
      'pt': 'Pedimos isso para relacionar sua conta com a apólice de assistência ao viajante contratada.',
      'fr': "Nous le demandons pour associer votre compte à votre police d'assistance voyage.",
    },
    'register.documentType': {
      'es': 'Tipo de documento',
      'en': 'Document type',
      'pt': 'Tipo de documento',
      'fr': 'Type de document',
    },
    'register.documentNumber': {
      'es': 'N° de documento',
      'en': 'Document number',
      'pt': 'Número do documento',
      'fr': 'Numéro de document',
    },
    'register.issuingCountry': {
      'es': 'País emisor',
      'en': 'Issuing country',
      'pt': 'País emissor',
      'fr': 'Pays émetteur',
    },
    'register.submitButton': {'es': 'Crear cuenta', 'en': 'Create account', 'pt': 'Criar conta', 'fr': 'Créer un compte'},
    'trips.formEditTitle': {'es': 'Editar viaje', 'en': 'Edit trip', 'pt': 'Editar viagem', 'fr': 'Modifier le voyage'},
    'trips.formNewTitle': {'es': 'Nuevo viaje', 'en': 'New trip', 'pt': 'Nova viagem', 'fr': 'Nouveau voyage'},
    'trips.tripNameLabel': {
      'es': 'Nombre del viaje (opcional)',
      'en': 'Trip name (optional)',
      'pt': 'Nome da viagem (opcional)',
      'fr': 'Nom du voyage (facultatif)',
    },
    'trips.startDateLabel': {'es': 'Fecha de inicio', 'en': 'Start date', 'pt': 'Data de início', 'fr': 'Date de début'},
    'trips.endDateLabel': {'es': 'Fecha de fin', 'en': 'End date', 'pt': 'Data de término', 'fr': 'Date de fin'},
    'trips.startDateFrom': {'es': 'Desde: {date}', 'en': 'From: {date}', 'pt': 'De: {date}', 'fr': 'Du : {date}'},
    'trips.endDateUntil': {'es': 'Hasta: {date}', 'en': 'Until: {date}', 'pt': 'Até: {date}', 'fr': "Jusqu'au : {date}"},
    'trips.destinationsOptional': {
      'es': 'Destinos (opcional)',
      'en': 'Destinations (optional)',
      'pt': 'Destinos (opcional)',
      'fr': 'Destinations (facultatif)',
    },
    'trips.destinationsHint': {
      'es': 'Podés cargar más de un país — el asistente va a poder avisarte vacunas, riesgos de salud y alertas de seguridad de cada uno.',
      'en': "You can add more than one country — the assistant will be able to tell you vaccinations, health risks and security alerts for each one.",
      'pt': 'Você pode adicionar mais de um país — o assistente vai poder avisar sobre vacinas, riscos de saúde e alertas de segurança de cada um.',
      'fr': "Vous pouvez ajouter plusieurs pays — l'assistant pourra vous indiquer les vaccins, risques sanitaires et alertes de sécurité de chacun.",
    },
    'trips.countryLabel': {'es': 'País', 'en': 'Country', 'pt': 'País', 'fr': 'Pays'},
    'trips.cityLabel': {'es': 'Ciudad (opcional)', 'en': 'City (optional)', 'pt': 'Cidade (opcional)', 'fr': 'Ville (facultatif)'},
    'trips.removeDestination': {
      'es': 'Quitar destino',
      'en': 'Remove destination',
      'pt': 'Remover destino',
      'fr': 'Supprimer la destination',
    },
    'trips.addAnotherDestination': {
      'es': 'Agregar otro destino',
      'en': 'Add another destination',
      'pt': 'Adicionar outro destino',
      'fr': 'Ajouter une autre destination',
    },
    'trips.pickDatesError': {
      'es': 'Elegí la fecha de inicio y la fecha de fin.',
      'en': 'Pick the start date and the end date.',
      'pt': 'Escolha a data de início e a data de término.',
      'fr': 'Choisissez la date de début et la date de fin.',
    },
    'trips.saveTripError': {
      'es': 'No se pudo guardar el viaje.',
      'en': "Couldn't save the trip.",
      'pt': 'Não foi possível salvar a viagem.',
      'fr': "Impossible d'enregistrer le voyage.",
    },
    'trips.saveButton': {'es': 'Guardar', 'en': 'Save', 'pt': 'Salvar', 'fr': 'Enregistrer'},
  };

  /// Traduce [key] al idioma actual — el de la cuenta logueada si ya
  /// se conoce (ver AuthState.preferredLang), o el del dispositivo
  /// antes de loguearse (login_screen no tiene forma de saber el
  /// idioma de una cuenta que todavía no existe). Si la clave no
  /// existe, devuelve la clave tal cual — así un olvido se nota en
  /// pantalla en vez de romper la app.
  static String of(BuildContext context, String key, {Map<String, String>? params}) {
    return forLang(_resolveLang(context), key, params: params);
  }

  /// Traduce [key] a un idioma EXPLÍCITO, sin pasar por context/AuthState
  /// — hace falta en register_screen.dart: ahí todavía no hay cuenta
  /// (AuthState.preferredLang no existe) y el idioma "actual" de esa
  /// pantalla es el que el usuario acaba de tocar en el selector de
  /// arriba (estado local del formulario, ver _preferredLang), no el del
  /// dispositivo ni el de ninguna sesión.
  static String forLang(String lang, String key, {Map<String, String>? params}) {
    final resolvedLang = _supported.contains(lang) ? lang : 'es';
    final entry = _t[key];
    var text = entry == null ? key : (entry[resolvedLang] ?? entry['es'] ?? key);
    if (params != null) {
      for (final e in params.entries) {
        text = text.replaceAll('{${e.key}}', e.value);
      }
    }
    return text;
  }

  static const _supported = {'es', 'en', 'pt', 'fr'};

  /// Público a propósito: lo usan las pantallas que muestran catálogos
  /// (CatalogValue.label(lang), ver catalog_service.dart) para elegir
  /// qué traducción de un valor de catálogo mostrar — mismo criterio de
  /// idioma que el resto de la interfaz fija.
  static String langOf(BuildContext context) => _resolveLang(context);

  // Bug real reportado en vivo (encontrado 3 veces, en 3 pantallas
  // distintas: profile_screen, health_form_screen, y ahora
  // trips_screen — "toco Guardar y no pasa nada, sin ningún error"):
  // context.watch<AuthState>() (como Localizations.maybeLocaleOf, que
  // también depende de un InheritedWidget) SOLO se puede llamar
  // durante build() — Provider tira una excepción SIN CAPTURAR si se
  // llama desde un callback (onPressed, un catch después de un await,
  // etc.), y esa excepción corta la función ahí mismo, en silencio, sin
  // guardar nada y sin mostrar ningún error. Antes esto se parchaba
  // pantalla por pantalla con un _trSafe local (context.read() en vez
  // de watch()) cada vez que se encontraba un caso nuevo — la tercera
  // vez que aparece el MISMO bug en un archivo distinto confirma que
  // vale más arreglarlo acá, una sola vez, para toda la app:
  // context.owner!.debugBuilding (el mismo chequeo que usa Provider
  // por dentro para esta exacta advertencia) dice si ESTE frame
  // todavía está construyendo — si es así, watch() es seguro y se
  // sigue usando (para que la pantalla se actualice sola si el idioma
  // cambia mientras está visible, comportamiento ya pedido antes).
  // Fuera de build (cualquier callback), se usa read() — no se
  // suscribe a cambios, así que nunca tira esta excepción.
  static String _resolveLang(BuildContext context) {
    final canWatch = context.owner?.debugBuilding ?? false;
    final authState = canWatch ? context.watch<AuthState>() : context.read<AuthState>();
    if (authState.isAuthenticated && _supported.contains(authState.preferredLang)) {
      return authState.preferredLang;
    }
    // Localizations.maybeLocaleOf tiene la MISMA restricción de
    // build() — este fallback (sin sesión todavía) es raro justo en un
    // callback, así que fuera de build se resuelve directo a español
    // en vez de arriesgar la misma excepción acá.
    if (!canWatch) return 'es';
    final deviceLang = Localizations.maybeLocaleOf(context)?.languageCode;
    return _supported.contains(deviceLang) ? deviceLang! : 'es';
  }
}

/// Atajo ergonómico: context.tr('home.title') en vez de
/// AppStrings.of(context, 'home.title') en cada pantalla.
extension AppStringsX on BuildContext {
  String tr(String key, {Map<String, String>? params}) => AppStrings.of(this, key, params: params);

  /// Código de idioma actual ('es'/'en'/'pt'/'fr') — para elegir la
  /// traducción correcta de un CatalogValue (ver catalog_service.dart).
  String get lang => AppStrings.langOf(this);
}
