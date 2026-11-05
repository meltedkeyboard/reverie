Pod::Spec.new do |s|
  s.name           = 'ReverieSmb'
  s.version        = '1.0.0'
  s.summary        = 'Direct SMB2/3 client for synchronization and browsing'
  s.description    = 'Direct in-app SMB client connecting over TCP port 445'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.license        = 'MIT'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.dependency 'AMSMB2'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES'
  }

  s.source_files = "**/*.{h,m,swift}"
end
