Pod::Spec.new do |s|
  s.name           = 'ReverieSaveAs'
  s.version        = '1.0.0'
  s.summary        = 'The system Save as sheet of Files'
  s.description    = 'The system Save as sheet of Files'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.license        = 'MIT'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES'
  }

  s.source_files = "**/*.{h,m,swift}"
end
